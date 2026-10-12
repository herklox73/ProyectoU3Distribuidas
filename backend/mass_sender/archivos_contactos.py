"""
Lectura de archivos de contactos para la importación.

Formatos aceptados:
  - Excel moderno: .xlsx .xlsm .xltx .xltm  (openpyxl)
  - Excel 97-2003: .xls                       (xlrd)
  - Excel binario: .xlsb                      (pyxlsb)
  - LibreOffice / OpenOffice: .ods            (lector propio, sin dependencias)
  - Texto: .csv .txt .tsv                     (separador detectado solo)

El archivo se lee en memoria (o en el archivo temporal que Django borra al
terminar la petición) y se devuelve como encabezados + filas de texto. No se
guarda en el servidor.
"""
import csv
import io
import re
import zipfile
from datetime import date, datetime
from xml.etree import ElementTree as ET

EXT_EXCEL = {'.xlsx', '.xlsm', '.xltx', '.xltm'}
EXT_TEXTO = {'.csv', '.txt', '.tsv'}
EXTENSIONES = EXT_EXCEL | EXT_TEXTO | {'.xls', '.xlsb', '.ods'}

MAX_BYTES = 50 * 1024 * 1024
MAX_FILAS = 100_000
MAX_COLUMNAS = 60


class ArchivoInvalido(Exception):
    pass


def _texto(valor):
    """Celda -> texto. Los números enteros pierden el '.0' (los teléfonos
    que Excel guarda como número llegan como 983706769.0)."""
    if valor is None:
        return ''
    if isinstance(valor, bool):
        return 'SI' if valor else 'NO'
    if isinstance(valor, float):
        if valor.is_integer():
            return str(int(valor))
        return repr(valor)
    if isinstance(valor, int):
        return str(valor)
    if isinstance(valor, datetime):
        return valor.strftime('%d/%m/%Y %H:%M') if (valor.hour or valor.minute) else valor.strftime('%d/%m/%Y')
    if isinstance(valor, date):
        return valor.strftime('%d/%m/%Y')
    return str(valor).strip()


def _limpiar(filas):
    """Quita filas vacías, recorta columnas vacías al final y separa el encabezado."""
    filas = [[_texto(c) for c in f[:MAX_COLUMNAS]] for f in filas]
    filas = [f for f in filas if any(c for c in f)]
    if not filas:
        raise ArchivoInvalido('El archivo no tiene datos.')
    ancho = max(len(f) for f in filas)
    while ancho > 1 and not any(len(f) >= ancho and f[ancho - 1] for f in filas):
        ancho -= 1
    filas = [(f + [''] * ancho)[:ancho] for f in filas]
    encabezados = [h or f'Columna {i + 1}' for i, h in enumerate(filas[0])]
    return encabezados, filas[1:]


def _limitar(iterable):
    filas = []
    for fila in iterable:
        filas.append(list(fila))
        if len(filas) > MAX_FILAS + 1:
            raise ArchivoInvalido(f'El archivo tiene más de {MAX_FILAS:,} filas. Divídelo en partes.'.replace(',', '.'))
    return filas


# ── Lectores por formato ────────────────────────────────────────────────
def _leer_xlsx(datos):
    from openpyxl import load_workbook
    try:
        wb = load_workbook(io.BytesIO(datos), read_only=True, data_only=True)
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el Excel. ¿Está dañado o protegido con contraseña?')
    try:
        ws = wb.worksheets[0]
        return _limitar(ws.iter_rows(values_only=True))
    finally:
        wb.close()


def _leer_xls(datos):
    import xlrd
    try:
        libro = xlrd.open_workbook(file_contents=datos)
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el Excel (.xls). ¿Está dañado o protegido con contraseña?')
    hoja = libro.sheet_by_index(0)

    def fila(r):
        out = []
        for c in range(hoja.ncols):
            celda = hoja.cell(r, c)
            if celda.ctype == xlrd.XL_CELL_DATE:
                try:
                    out.append(xlrd.xldate.xldate_as_datetime(celda.value, libro.datemode))
                    continue
                except Exception:
                    pass
            out.append(celda.value)
        return out
    return _limitar(fila(r) for r in range(hoja.nrows))


def _leer_xlsb(datos):
    from pyxlsb import open_workbook
    try:
        with open_workbook(io.BytesIO(datos)) as wb:
            with wb.get_sheet(1) as hoja:
                return _limitar([c.v for c in fila] for fila in hoja.rows())
    except ArchivoInvalido:
        raise
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el Excel binario (.xlsb).')


def _leer_ods(datos):
    """Lee la primera hoja de un .ods (es un zip con content.xml)."""
    NS = {
        'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
        'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
        'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    }
    t = '{%s}' % NS['table']
    o = '{%s}' % NS['office']
    try:
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            xml = z.read('content.xml')
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el archivo .ods.')
    raiz = ET.fromstring(xml)
    hoja = raiz.find('.//table:table', NS)
    if hoja is None:
        raise ArchivoInvalido('El archivo .ods no tiene hojas.')

    filas = []
    for fila in hoja.iter(f'{t}table-row'):
        rep_f = min(int(fila.get(f'{t}number-rows-repeated', '1')), 1000)
        celdas = []
        for celda in fila:
            if celda.tag not in (f'{t}table-cell', f'{t}covered-table-cell'):
                continue
            rep_c = min(int(celda.get(f'{t}number-columns-repeated', '1')), MAX_COLUMNAS)
            tipo = celda.get(f'{o}value-type')
            if tipo in ('float', 'percentage', 'currency'):
                try:
                    valor = float(celda.get(f'{o}value'))
                except (TypeError, ValueError):
                    valor = ''
            else:
                valor = '\n'.join(''.join(p.itertext()) for p in celda.findall('text:p', NS))
            celdas.extend([valor] * rep_c)
        if any(_texto(c) for c in celdas):
            filas.extend([celdas] * rep_f)
        else:
            filas.append(celdas)   # filas vacías repetidas: se descartan luego
        if len(filas) > MAX_FILAS + 1:
            raise ArchivoInvalido(f'El archivo tiene más de {MAX_FILAS:,} filas. Divídelo en partes.'.replace(',', '.'))
    return filas


def _leer_texto(datos, separador=''):
    for codif in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            texto = datos.decode(codif)
            break
        except UnicodeDecodeError:
            continue
    if not separador:
        muestra = texto[:20000]
        try:
            separador = csv.Sniffer().sniff(muestra, delimiters=',;\t|').delimiter
        except csv.Error:
            # Se elige el separador que más aparece en la primera línea
            primera = muestra.splitlines()[0] if muestra else ''
            separador = max(',;\t|', key=primera.count) if primera else ','
    lector = csv.reader(io.StringIO(texto, newline=''), delimiter=separador)
    return _limitar(lector)


def leer_archivo(archivo, separador=''):
    """Devuelve (encabezados, filas) a partir de un UploadedFile de Django."""
    nombre = (archivo.name or '').lower()
    ext = '.' + nombre.rsplit('.', 1)[-1] if '.' in nombre else ''
    if ext not in EXTENSIONES:
        raise ArchivoInvalido('Formato no soportado. Usa Excel (.xlsx, .xls, .xlsm, .xlsb), .ods o .csv.')
    if archivo.size > MAX_BYTES:
        raise ArchivoInvalido('El archivo supera el límite de 50 MB.')

    datos = archivo.read()
    if ext in EXT_EXCEL:
        filas = _leer_xlsx(datos)
    elif ext == '.xls':
        # Algunos sistemas exportan HTML o CSV con extensión .xls
        if datos[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
            filas = _leer_xls(datos)
        elif datos[:2] == b'PK':
            filas = _leer_xlsx(datos)
        elif re.match(rb'\s*<', datos[:200]):
            raise ArchivoInvalido('Este .xls es en realidad una página web. Ábrelo en Excel y guárdalo como .xlsx.')
        else:
            filas = _leer_texto(datos, separador or '\t')
    elif ext == '.xlsb':
        filas = _leer_xlsb(datos)
    elif ext == '.ods':
        filas = _leer_ods(datos)
    else:
        filas = _leer_texto(datos, separador)
    return _limpiar(filas)
