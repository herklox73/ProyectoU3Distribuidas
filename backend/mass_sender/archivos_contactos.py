"""
Lectura de archivos de contactos para la importación.

Las hojas de cálculo se leen con python-calamine (lector en Rust: 300.000
filas en ~2 s y poca memoria). Si un archivo raro no le sirve, se usa el
lector clásico de cada formato:
  - Excel moderno: .xlsx .xlsm .xltx .xltm  (openpyxl)
  - Excel 97-2003: .xls                       (xlrd)
  - Excel binario: .xlsb                      (pyxlsb)
  - LibreOffice / OpenOffice: .ods            (lector propio, sin dependencias)
  - Texto: .csv .txt .tsv                     (separador detectado solo)

Los archivos (Excel o CSV) pueden pesar hasta 1 GB: se leen desde el archivo
temporal que Django crea durante la subida, por partes, sin cargarlo entero
en memoria. Django borra ese temporal al terminar
la petición, así que no se guarda nada en el servidor. Lo que sí tiene tope es
la cantidad de filas (MAX_FILAS), porque todas viajan a la vista previa.
"""
import csv
import io
import re
import zipfile
from datetime import date, datetime
from xml.etree import ElementTree as ET

EXT_EXCEL = {'.xlsx', '.xlsm', '.xltx', '.xltm'}
EXT_TEXTO = {'.csv', '.txt', '.tsv'}
EXT_HOJAS = EXT_EXCEL | {'.xls', '.xlsb', '.ods'}      # Excel y similares
EXTENSIONES = EXT_HOJAS | EXT_TEXTO

MAX_BYTES_EXCEL = 1024 * 1024 * 1024    # 1 GB
MAX_FILAS = 500_000
MAX_COLUMNAS = 60
MAX_CARACTERES = 255   # por celda: ningún campo del contacto guarda más
MAX_VACIAS = 5000      # filas vacías seguidas tras las que se deja de leer
MAX_SEGUNDOS = 200     # tiempo máximo de lectura (gunicorn corta a los 300 s)


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
    """Recorta columnas vacías al final y separa el encabezado (las filas ya
    vienen en texto y sin filas vacías desde _limitar). Trabaja sobre la
    misma lista para no duplicar la memoria."""
    if not filas:
        raise ArchivoInvalido('El archivo no tiene datos.')
    ancho = max(len(f) for f in filas)
    while ancho > 1 and not any(len(f) >= ancho and f[ancho - 1] for f in filas):
        ancho -= 1
    for i, f in enumerate(filas):
        if len(f) != ancho:
            filas[i] = (f + [''] * ancho)[:ancho]
    encabezados = [h or f'Columna {i + 1}' for i, h in enumerate(filas[0])]
    del filas[0]
    return encabezados, filas


def _vacia(fila):
    return not any(c is not None and str(c).strip() for c in fila)


def _limitar(iterable):
    """
    Junta las filas con datos. Muchos Excel traen formato (bordes, colores)
    aplicado a cientos de miles de filas vacías: esas no cuentan, y si
    aparecen MAX_VACIAS seguidas se deja de leer (ya no hay más datos).
    """
    import time
    inicio = time.monotonic()
    filas = []
    vacias = 0
    for n, fila in enumerate(iterable):
        if n % 2000 == 0 and time.monotonic() - inicio > MAX_SEGUNDOS:
            raise ArchivoInvalido('El archivo tarda demasiado en leerse. Copia solo las columnas de '
                                  'contactos a un Excel nuevo y vuelve a intentarlo.')
        if _vacia(fila):
            vacias += 1
            if vacias >= MAX_VACIAS and filas:
                break
            continue
        vacias = 0
        # Se pasa a texto y se recorta cada celda al leer: un archivo enorme
        # por notas largas no llena la memoria
        filas.append([_texto(c)[:MAX_CARACTERES] for c in fila[:MAX_COLUMNAS]])
        if len(filas) > MAX_FILAS + 1:
            raise ArchivoInvalido(f'El archivo tiene más de {MAX_FILAS:,} contactos. Divídelo en partes.'.replace(',', '.'))
    return filas


# ── Lectores por formato ────────────────────────────────────────────────
def _leer_calamine(ruta):
    from python_calamine import CalamineWorkbook
    with open(ruta, 'rb') as fh:
        wb = CalamineWorkbook.from_filelike(fh)
        hoja = wb.get_sheet_by_index(0)
        return _limitar(hoja.iter_rows())


def _leer_xlsx(ruta):
    from openpyxl import load_workbook
    # Se pasa el archivo abierto (no la ruta) para que openpyxl no rechace
    # un xlsx guardado con otra extensión (.xls, .upload, ...).
    with open(ruta, 'rb') as fh:
        try:
            wb = load_workbook(fh, read_only=True, data_only=True)
        except Exception:
            raise ArchivoInvalido('No se pudo abrir el Excel. ¿Está dañado o protegido con contraseña?')
        try:
            ws = wb.worksheets[0]
            # max_col: un formato aplicado hasta la columna XFD (16.384) no se recorre
            return _limitar(ws.iter_rows(max_col=MAX_COLUMNAS, values_only=True))
        finally:
            wb.close()


def _leer_xls(ruta):
    import xlrd
    try:
        libro = xlrd.open_workbook(filename=ruta, on_demand=True)
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el Excel (.xls). ¿Está dañado o protegido con contraseña?')
    hoja = libro.sheet_by_index(0)

    def fila(r):
        out = []
        for c in range(min(hoja.ncols, MAX_COLUMNAS)):
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


def _leer_xlsb(ruta):
    from pyxlsb import open_workbook
    try:
        with open_workbook(ruta) as wb:
            with wb.get_sheet(1) as hoja:
                return _limitar([c.v for c in fila] for fila in hoja.rows())
    except ArchivoInvalido:
        raise
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el Excel binario (.xlsb).')


def _leer_ods(ruta):
    """Lee la primera hoja de un .ods (un zip con content.xml), por partes."""
    T = '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
    O = '{urn:oasis:names:tc:opendocument:xmlns:office:1.0}'
    P = '{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p'
    try:
        z = zipfile.ZipFile(ruta)
        xml = z.open('content.xml')
    except Exception:
        raise ArchivoInvalido('No se pudo abrir el archivo .ods.')

    filas = []
    hojas = 0
    with z, xml:
        for evento, elem in ET.iterparse(xml, events=('start', 'end')):
            if evento == 'start':
                if elem.tag == f'{T}table':
                    hojas += 1
                continue
            if hojas != 1:
                if elem.tag == f'{T}table':
                    break            # solo la primera hoja
                continue
            if elem.tag != f'{T}table-row':
                continue
            rep_f = min(int(elem.get(f'{T}number-rows-repeated', '1')), 1000)
            celdas = []
            for celda in elem:
                if celda.tag not in (f'{T}table-cell', f'{T}covered-table-cell'):
                    continue
                rep_c = min(int(celda.get(f'{T}number-columns-repeated', '1')), MAX_COLUMNAS)
                if celda.get(f'{O}value-type') in ('float', 'percentage', 'currency'):
                    try:
                        valor = float(celda.get(f'{O}value'))
                    except (TypeError, ValueError):
                        valor = ''
                else:
                    valor = '\n'.join(''.join(p.itertext()) for p in celda.findall(P))
                celdas.extend([valor] * rep_c)
            elem.clear()
            if any(_texto(c) for c in celdas):
                filas.extend([celdas] * rep_f)
            if len(filas) > MAX_FILAS + 1:
                raise ArchivoInvalido(f'El archivo tiene más de {MAX_FILAS:,} filas. Divídelo en partes.'.replace(',', '.'))
    if hojas == 0:
        raise ArchivoInvalido('El archivo .ods no tiene hojas.')
    return filas


def _leer_texto(ruta, separador=''):
    """CSV/TXT leído línea a línea desde disco (sirve para archivos de 1 GB)."""
    with open(ruta, 'rb') as fh:
        crudo = fh.read(256 * 1024)
    # Codificación: UTF-8 si la muestra lo es; si no, la de Excel en Windows
    try:
        crudo.decode('utf-8-sig')
        codif = 'utf-8-sig'
    except UnicodeDecodeError as e:
        # La muestra pudo cortar un carácter a la mitad justo al final
        codif = 'utf-8-sig' if e.start >= len(crudo) - 4 else 'cp1252'
    muestra = crudo.decode(codif, errors='replace')[:20000]
    if not separador:
        try:
            separador = csv.Sniffer().sniff(muestra, delimiters=',;\t|').delimiter
        except csv.Error:
            # Se elige el separador que más aparece en la primera línea
            primera = muestra.splitlines()[0] if muestra else ''
            separador = max(',;\t|', key=primera.count) if primera else ','
    with open(ruta, 'r', encoding=codif, errors='replace', newline='') as fh:
        return _limitar(csv.reader(fh, delimiter=separador))


def leer_archivo(archivo, separador=''):
    """Devuelve (encabezados, filas) a partir de un UploadedFile de Django."""
    nombre = (archivo.name or '').lower()
    ext = '.' + nombre.rsplit('.', 1)[-1] if '.' in nombre else ''
    if ext not in EXTENSIONES:
        raise ArchivoInvalido('Formato no soportado. Usa Excel (.xlsx, .xls, .xlsm, .xlsb), .ods o .csv.')
    if archivo.size > MAX_BYTES_EXCEL:
        raise ArchivoInvalido('El archivo supera el límite de 1 GB.')

    # Se lee desde una ruta en disco (el temporal de la subida). Si el archivo es pequeño y Django lo tuvo en memoria, se
    # escribe un temporal propio que se borra al terminar.
    import os
    import tempfile
    propio = None
    if hasattr(archivo, 'temporary_file_path'):
        ruta = archivo.temporary_file_path()
    else:
        fd, propio = tempfile.mkstemp(suffix=ext)
        with os.fdopen(fd, 'wb') as out:
            for trozo in archivo.chunks():
                out.write(trozo)
        ruta = propio
    try:
        with open(ruta, 'rb') as fh:
            cabecera = fh.read(512)
        filas = None
        if ext in EXT_HOJAS and not re.match(rb'\s*<', cabecera[:200]):
            try:
                filas = _leer_calamine(ruta)
            except ArchivoInvalido:
                raise
            except Exception:
                filas = None   # se prueba con el lector clásico
        if filas is not None:
            pass
        elif ext in EXT_TEXTO:
            filas = _leer_texto(ruta, separador)
        elif ext in EXT_EXCEL:
            filas = _leer_xlsx(ruta)
        elif ext == '.xls':
            # Algunos sistemas exportan HTML, CSV o xlsx con extensión .xls
            if cabecera[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
                filas = _leer_xls(ruta)
            elif cabecera[:2] == b'PK':
                filas = _leer_xlsx(ruta)
            elif re.match(rb'\s*<', cabecera[:200]):
                raise ArchivoInvalido('Este .xls es en realidad una página web. Ábrelo en Excel y guárdalo como .xlsx.')
            else:
                filas = _leer_texto(ruta, separador or '\t')
        elif ext == '.xlsb':
            filas = _leer_xlsb(ruta)
        else:
            filas = _leer_ods(ruta)
    finally:
        if propio:
            try:
                os.remove(propio)
            except OSError:
                pass
    return _limpiar(filas)
