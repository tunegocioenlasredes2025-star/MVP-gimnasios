#!/usr/bin/env python3
"""
Genera el Excel de cuentas del MISMO rubro que Tu Negocio En Las Redes
(agencias de marketing digital, community managers, freelancers de redes)
para seguir y mandar mensaje.

Ojo: NO son prospectos para venderles. Son pares / colegas.
Columna "Seguidores" solo cuando el dato aparecio en la busqueda.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

# (usuario_ig, nombre, donde_queda, seguidores, tipo)
CUENTAS = [
    # --- Zona oeste / GBA (los mas cercanos a tu zona) ---
    ("@castelardigital", "Castelar Digital", "Castelar, zona oeste GBA", "27.000", "Medio local / comunicacion"),
    ("@linkup.redes", "Link Up - Agencia MKT Digital / CM", "Buenos Aires", "", "Agencia"),
    ("@imaat.argentina", "IMaat Marketing Digital", "Argentina", "254", "Agencia"),
    ("@godigital.agency", "Go Digital Agency", "Argentina", "", "Agencia"),
    ("@md.marketing.digital", "MD Marketing Digital", "Argentina", "7.119", "Agencia"),

    # --- Community managers / freelancers (los mas parecidos a ustedes) ---
    ("@community.manager.arg", "Community Manager Argentina", "Argentina", "6.416", "Community manager"),
    ("@she.agencia", "SHE Agencia - Servicio de Community Manager", "Argentina", "", "Community manager"),
    ("@widigitalarg", "WI Digital - CM / Manejo de redes", "Argentina", "", "Community manager"),
    ("@marksocialarg", "Mark Social - Community Manager / MKT digital", "Argentina", "", "Community manager"),
    ("@gestion.de.redes.sociales", "Gestion de Redes Sociales - Community Manager", "Argentina", "", "Community manager"),
    ("@soledadcommunity", "Soledad - Manejo de Redes / Community Manager", "Buenos Aires", "", "Community manager"),
    ("@communitymanager.cba", "Community Manager CBA", "Cordoba", "2.399", "Community manager"),
    ("@veroenredes", "Vero en Redes - CM, estrategia y plantillas", "Argentina", "67.000", "Community manager"),

    # --- Agencias chicas / medianas para pymes y emprendedores ---
    ("@flowdigital_agencia", "Flow Digital - Agencia para PYMES", "Argentina", "635", "Agencia"),
    ("@pymewebdigital", "PYME WEB - Marketing Digital", "Argentina", "2.399", "Agencia"),
    ("@mktactiva", "Mkt Activa - Marketing para emprendedores y pymes", "Argentina", "4.256", "Agencia"),
    ("@_ziguatanejo", "Ziguatanejo - Agencia de Marketing Digital", "Argentina", "3.282", "Agencia"),
    ("@somos.nomad", "NOMAD - Agencia de Marketing Digital", "Argentina", "", "Agencia"),
    ("@bidsoluciones", "BID Soluciones - Agencia de Marketing Digital", "Argentina", "", "Agencia"),
    ("@teipe.digital", "Teipe Digital - Agencia MKT / Shopify Partner", "Argentina", "", "Agencia"),
    ("@wopmarketing", "WOP - Agencia Digital", "Argentina", "", "Agencia"),
    ("@3agencia_digital", "3 Agencia Digital - Growth Marketing", "Argentina", "", "Agencia"),
    ("@revolucionred", "RevolucionRED - Redes sociales y Marketing 360", "Argentina", "", "Agencia"),
    ("@dueagenciamarketing", "DUE Agencia Marketing Digital", "Argentina", "", "Agencia"),
    ("@th.ar.marketing", "Th Marketing", "Argentina", "", "Agencia"),
    ("@somos.diigital", "Somos Diigital - CM / Agencia MKT Digital", "Argentina", "14.000", "Agencia"),
    ("@escueladeredes", "Escuela de Redes - Agencia MKT + capacitacion", "Argentina", "32.000", "Agencia + formacion"),
    ("@ag.webs", "AG Webs - Marketing, gestion de redes, ADS, cursos", "Argentina", "30.000", "Agencia + formacion"),

    # --- Interior del pais (para cuando estires) ---
    ("@catorcemarketing", "Catorce Marketing - Agencia MKT Digital", "Cordoba", "", "Agencia"),
    ("@marketingencordoba", "Marketing en Cordoba - Webs y tiendas online", "Cordoba", "", "Agencia"),
    ("@marketingonlinecba", "Marketing Digital Cordoba", "Cordoba", "", "Agencia"),
    ("@ignaccoloandco", "Ignaccolo & Co - Agencia MKT / CM", "Rosario, Santa Fe", "", "Agencia"),
    ("@digitalmarketing.rosario", "IT Digital Agency", "Rosario, Santa Fe", "", "Agencia"),
    ("@muta.digital", "Muta Digital - Agencia de Marketing", "Mar del Plata", "", "Agencia"),
    ("@soydiegocabral", "Diego Cabral", "Argentina", "", "Referente / marca personal"),
]

# Aparecieron en las busquedas pero no se pudo confirmar que sean de Argentina.
A_VERIFICAR = [
    ("@agencia.purpose", "Purpose - Marketing & Social Media", "confirmar pais"),
    ("@estudiocreativohello", "Estudio Creativo Hello - Agencia Social Media", "confirmar pais"),
    ("@monicaprados_", "Monica - Social Media y gestion de redes", "confirmar pais (posible Espana)"),
    ("@agencia.mkt.digital.pymes", "Agencia MKT Digital Pymes", "confirmar pais"),
    ("@agencia.marketingpyme", "Agencia Marketing Pyme", "confirmar pais"),
    ("@hendrickg74", "Community manager / asesoria", "confirmar pais"),
]

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)


def escribir_hoja(ws, headers, ancho, filas):
    ws.append(headers)
    for celda in ws[1]:
        celda.fill = HEADER_FILL
        celda.font = HEADER_FONT
        celda.alignment = Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = "A2"

    for fila in filas:
        usuario = fila[0]
        ws.append(list(fila) + [f"https://www.instagram.com/{usuario.lstrip('@')}/"])

    for i, w in enumerate(ancho, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"


def main():
    wb = Workbook()

    ws = wb.active
    ws.title = "Cuentas mismo rubro"
    escribir_hoja(
        ws,
        ["Usuario IG", "Nombre", "Donde queda", "Seguidores", "Tipo", "Link"],
        [30, 48, 26, 13, 26, 46],
        CUENTAS,
    )

    ws2 = wb.create_sheet("A verificar")
    escribir_hoja(
        ws2,
        ["Usuario IG", "Nombre", "Nota", "Link"],
        [30, 48, 32, 46],
        A_VERIFICAR,
    )

    wb.save("agencias_instagram.xlsx")
    print(f"OK - {len(CUENTAS)} cuentas + {len(A_VERIFICAR)} a verificar")


if __name__ == "__main__":
    main()
