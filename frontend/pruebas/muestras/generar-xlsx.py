"""Genera pruebas/muestras/clientes.xlsx.

Un .xlsx es un zip con cinco piezas XML. Se genera en vez de commitear un
binario opaco: así se puede leer qué contiene la muestra y por qué. El
archivo resultante SÍ está versionado, para que el CI no necesite Python.

    python pruebas/muestras/generar-xlsx.py
"""
import os
import zipfile

FILAS = [
    ["Nombre", "Correo electrónico", "Teléfono"],
    ["Muñoz, S.L.", "muñoz@ejemplo.es", "961234567"],
    ["Clínica Ruiz", "ruiz@ejemplo.es", "962345678"],
    ["Gil e Hijos", "gil@ejemplo.es", "963456789"],
]

def celda(col, fila, texto):
    ref = chr(ord("A") + col) + str(fila)
    return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{texto}</t></is></c>'

filas_xml = "".join(
    f'<row r="{i+1}">' + "".join(celda(j, i + 1, c) for j, c in enumerate(f)) + "</row>"
    for i, f in enumerate(FILAS)
)

PIEZAS = {
    "[Content_Types].xml":
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>",
    "_rels/.rels":
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>",
    "xl/workbook.xml":
        '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>",
    "xl/worksheets/sheet1.xml":
        '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{filas_xml}</sheetData></worksheet>",
}

ruta = os.path.join(os.path.dirname(__file__), "clientes.xlsx")
with zipfile.ZipFile(ruta, "w", zipfile.ZIP_DEFLATED) as z:
    for nombre, contenido in PIEZAS.items():
        z.writestr(nombre, contenido)
print("generado:", ruta, os.path.getsize(ruta), "bytes")
