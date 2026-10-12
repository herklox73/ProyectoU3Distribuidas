"""
Escritor mínimo de .xlsx por streaming.

openpyxl tarda ~1 minuto en escribir 300.000 filas; este escritor arma el XML
directamente (texto en línea, sin tabla de cadenas compartidas) y lo comprime
mientras escribe, así que tarda unos segundos y casi no usa memoria. Solo
cubre lo que necesitan las exportaciones: texto, números, fechas, encabezado
con color, anchos de columna y primera fila fija.
"""
import io
import re
import zipfile
from datetime import date, datetime
from xml.sax.saxutils import escape

_ILEGAL = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]')
_EPOCH = datetime(1899, 12, 30)

_ESTILOS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1D7F45"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''

ESTILO_ENCABEZADO = 1
ESTILO_TITULO = 3


def _col(n):
    letras = ''
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        letras = chr(65 + r) + letras
    return letras


def _celda(ref, valor, estilo=0):
    s = f' s="{estilo}"' if estilo else ''
    if valor is None or valor == '':
        return f'<c r="{ref}"{s}/>' if estilo else ''
    if isinstance(valor, bool):
        valor = 'Sí' if valor else 'No'
    if isinstance(valor, (int, float)):
        return f'<c r="{ref}"{s}><v>{valor}</v></c>'
    if isinstance(valor, datetime):
        serial = (valor.replace(tzinfo=None) - _EPOCH).total_seconds() / 86400
        return f'<c r="{ref}" s="2"><v>{serial:.6f}</v></c>'
    if isinstance(valor, date):
        serial = (datetime(valor.year, valor.month, valor.day) - _EPOCH).days
        return f'<c r="{ref}" s="2"><v>{serial}</v></c>'
    texto = escape(_ILEGAL.sub('', str(valor)))
    return f'<c r="{ref}" t="inlineStr"{s}><is><t xml:space="preserve">{texto}</t></is></c>'


_LETRAS = [_col(i) for i in range(200)]


class LibroRapido:
    """Uso:
        libro = LibroRapido()
        hoja = libro.hoja('Contactos', anchos=[20, 30], fijar_encabezado=True)
        hoja.fila(['Nombre', 'Teléfono'], estilo=ESTILO_ENCABEZADO)
        hoja.fila(['Ana', '+593 ...'])
        datos = libro.cerrar()
    """

    def __init__(self):
        self._buf = io.BytesIO()
        self._zip = zipfile.ZipFile(self._buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=3)
        self._hojas = []
        self._actual = None

    def hoja(self, nombre, anchos=None, fijar_encabezado=False):
        if self._actual:
            self._actual._cerrar()
        h = _Hoja(self._zip, len(self._hojas) + 1, anchos or [], fijar_encabezado)
        self._hojas.append(nombre[:31])
        self._actual = h
        return h

    def cerrar(self):
        if self._actual:
            self._actual._cerrar()
        z = self._zip
        n = len(self._hojas)
        z.writestr('[Content_Types].xml',
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="xml" ContentType="application/xml"/>'
                   '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                   '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                   + ''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             for i in range(1, n + 1))
                   + '</Types>')
        z.writestr('_rels/.rels',
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                   '</Relationships>')
        z.writestr('xl/workbook.xml',
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                   'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
                   + ''.join(f'<sheet name="{escape(nom)}" sheetId="{i}" r:id="rId{i}"/>'
                             for i, nom in enumerate(self._hojas, start=1))
                   + '</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels',
                   '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   + ''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
                             for i in range(1, n + 1))
                   + f'<Relationship Id="rId{n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                   '</Relationships>')
        z.writestr('xl/styles.xml', _ESTILOS)
        z.close()
        return self._buf.getvalue()


class _Hoja:
    def __init__(self, z, numero, anchos, fijar):
        self._f = z.open(f'xl/worksheets/sheet{numero}.xml', 'w')
        self._n = 0
        self._pendiente = []
        cab = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
        if fijar:
            cab += ('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" '
                    'activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
        if anchos:
            cab += '<cols>' + ''.join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>'
                                      for i, w in enumerate(anchos, start=1)) + '</cols>'
        cab += '<sheetData>'
        self._f.write(cab.encode('utf-8'))

    def fila(self, valores, estilo=0):
        self._n += 1
        r = self._n
        self._pendiente.append(
            f'<row r="{r}">' + ''.join(_celda(f'{_LETRAS[i]}{r}', v, estilo) for i, v in enumerate(valores)) + '</row>'
        )
        if len(self._pendiente) >= 2000:
            self._volcar()

    def _volcar(self):
        if self._pendiente:
            self._f.write(''.join(self._pendiente).encode('utf-8'))
            self._pendiente = []

    def _cerrar(self):
        self._volcar()
        self._f.write(b'</sheetData></worksheet>')
        self._f.close()
