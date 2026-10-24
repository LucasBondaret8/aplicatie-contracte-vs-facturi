"""Genereaza datele de demo: 3 contracte PDF + 36 e-Facturi XML (UBL 2.1 / CIUS-RO).

Toate firmele, CUI-urile si sumele sunt FICTIVE.
Rulare: python generate_demo.py  (necesita: pip install reportlab)
"""
import json
from datetime import date
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).parent
TVA = 21  # cota standard TVA in Romania din 1 august 2025

CLIENT = {
    "nume": "Demo Consult SRL", "cui": "RO40000001", "reg": "J40/1001/2020",
    "strada": "Str. Exemplu nr. 10", "oras": "SECTOR1", "judet": "RO-B",
}

FURNIZORI = {
    "telconet": {
        "nume": "TelcoNet Mobile SRL", "cui": "RO40000002", "reg": "J40/2002/2015",
        "strada": "Bd. Comunicatiilor nr. 5", "oras": "SECTOR2", "judet": "RO-B",
        "contract": "TN-2025-0117", "prefix": "TN",
    },
    "cleanpro": {
        "nume": "CleanPro Services SRL", "cui": "RO40000003", "reg": "J12/3003/2018",
        "strada": "Str. Curateniei nr. 3", "oras": "Cluj-Napoca", "judet": "RO-CJ",
        "contract": "CP-2025-044", "prefix": "CP",
    },
    "softnet": {
        "nume": "SoftNet Solutions SRL", "cui": "RO40000004", "reg": "J22/4004/2019",
        "strada": "Str. Programatorilor nr. 8", "oras": "Iasi", "judet": "RO-IS",
        "contract": "SN-2025-009", "prefix": "SN",
    },
}

# Lunile facturate: octombrie 2025 - septembrie 2026
LUNI = [(2025, m) for m in (10, 11, 12)] + [(2026, m) for m in range(1, 10)]

# ---------------------------------------------------------------- contracte

# Formulările sunt clare intenționat, ca fișa să poată fi completată și de extractorul fără AI al aplicației.
CONTRACTE = {
    "telconet": [
        ("Art. 1. Părțile", "Furnizor: <b>TelcoNet Mobile SRL</b>, CUI RO40000002.<br/>"
         "Beneficiar: <b>Demo Consult SRL</b>, CUI RO40000001."),
        ("Art. 2. Obiectul contractului: servicii de telefonie mobilă.",
         "Furnizorul asigură servicii de telefonie mobilă pentru <b>5 (cinci) linii</b>, abonament „Business 50GB”, "
         "cu minute și SMS nelimitate naționale."),
        ("Art. 3. Durata", "Contractul intră în vigoare la <b>01.01.2025</b> și este valabil până la <b>31.12.2026</b>."),
        ("Art. 4. Prețul", "Prețul este de <b>20,00 lei/lună pentru fiecare linie</b>, fără TVA. "
         "Facturarea se face lunar, la începutul lunii, pentru luna în curs."),
        ("Art. 5. Indexarea", "Prețul se poate indexa o singură dată pe an, în luna ianuarie, cu indicele prețurilor "
         "de consum (IPC) comunicat de INS pentru anul anterior, plafonat la <b>maximum 5,6%</b> pe an."),
        ("Art. 6. Reînnoirea", "La expirare, contractul se prelungește automat cu 12 luni, dacă niciuna "
         "dintre părți nu notifică în scris intenția de încetare cu <b>cel puțin 30 de zile</b> înainte."),
        ("Art. 7. Plata", "Plata se face în termen de 15 zile de la emiterea facturii."),
    ],
    "cleanpro": [
        ("Art. 1. Părțile", "Prestator: <b>CleanPro Services SRL</b>, CUI RO40000003.<br/>"
         "Beneficiar: <b>Demo Consult SRL</b>, CUI RO40000001."),
        ("Art. 2. Obiectul contractului: servicii de curățenie birou.",
         "Prestatorul asigură servicii de curățenie pentru biroul Beneficiarului (120 mp), de 2 ori pe săptămână, "
         "adică <b>8 intervenții pe lună</b>."),
        ("Art. 3. Durata", "Contractul intră în vigoare la <b>01.09.2025</b> și este valabil până la <b>31.08.2027</b>."),
        ("Art. 4. Prețul", "Prețul este <b>fix, de 1.450,00 lei/lună</b>, fără TVA, pe toată durata "
         "contractului. <b>Prețul nu se modifică.</b>"),
        ("Art. 5. Recepția", "La sfârșitul fiecărei luni, părțile semnează un proces-verbal cu "
         "intervențiile efectuate. Intervențiile neefectuate se scad din factură proporțional."),
        ("Art. 6. Încetarea", "Oricare parte poate denunța contractul cu o notificare scrisă de 60 de zile."),
        ("Art. 7. Plata", "Plata se face în termen de 30 de zile de la emiterea facturii."),
    ],
    "softnet": [
        ("Art. 1. Părțile", "Furnizor: <b>SoftNet Solutions SRL</b>, CUI RO40000004.<br/>"
         "Beneficiar: <b>Demo Consult SRL</b>, CUI RO40000001."),
        ("Art. 2. Obiectul contractului: licențe software SoftNet CRM.",
         "Furnizorul acordă dreptul de utilizare pentru <b>20 (douăzeci) licențe</b> ale aplicației „SoftNet CRM”, "
         "inclusiv suport tehnic standard."),
        ("Art. 3. Durata", "Contractul intră în vigoare la <b>01.01.2025</b> și este valabil până la <b>31.12.2026</b>."),
        ("Art. 4. Prețul", "Prețul este de <b>115,00 lei/lună pentru fiecare licență</b>, fără TVA. "
         "Suportul tehnic standard este inclus în preț. Orice serviciu suplimentar se facturează "
         "doar pe baza unui act adițional semnat de ambele părți."),
        ("Art. 5. Discount", "Beneficiarul primește un <b>discount de 10%</b> din valoarea licențelor "
         "pentru perioada <b>01.01.2025 – 31.03.2026</b>."),
        ("Art. 6. Modificarea numărului de licențe", "Numărul de licențe poate fi modificat doar prin "
         "act adițional semnat de ambele părți."),
        ("Art. 7. Plata", "Plata se face în termen de 30 de zile de la emiterea facturii."),
        ("Art. 8. Reînnoirea", "La expirare, contractul se prelungește automat cu 12 luni, dacă "
         "Beneficiarul nu notifică încetarea cu <b>cel puțin 30 de zile</b> înainte de expirare."),
    ],
}
TERMEN_PLATA = {"telconet": 15, "cleanpro": 30, "softnet": 30}  # zile, ca în contracte


def genereaza_contracte():
    pdfmetrics.registerFont(TTFont("Arial", "C:/Windows/Fonts/arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", "C:/Windows/Fonts/arialbd.ttf"))
    pdfmetrics.registerFontFamily("Arial", normal="Arial", bold="Arial-Bold")
    titlu = ParagraphStyle("t", fontName="Arial-Bold", fontSize=15, leading=20, spaceAfter=4)
    sub = ParagraphStyle("s", fontName="Arial", fontSize=10, leading=14, textColor="#555555")
    h = ParagraphStyle("h", fontName="Arial-Bold", fontSize=11, leading=15, spaceBefore=10)
    p = ParagraphStyle("p", fontName="Arial", fontSize=10.5, leading=15)

    (OUT / "contracte").mkdir(exist_ok=True)
    for cheie, articole in CONTRACTE.items():
        f = FURNIZORI[cheie]
        doc = SimpleDocTemplate(str(OUT / "contracte" / f"{cheie}.pdf"), pagesize=A4,
                                leftMargin=55, rightMargin=55, topMargin=50, bottomMargin=50)
        story = [Paragraph(f"CONTRACT NR. {f['contract']}", titlu),
                 Paragraph(f"{f['nume']} – {CLIENT['nume']} · DOCUMENT FICTIV PENTRU DEMO", sub),
                 Spacer(1, 8)]
        for art, text in articole:
            story += [Paragraph(art, h), Paragraph(text, p)]
        story += [Spacer(1, 30), Paragraph("Furnizor/Prestator: ______________ &nbsp;&nbsp;&nbsp; "
                                           "Beneficiar: ______________", p)]
        doc.build(story)


# ---------------------------------------------------------------- facturi

def linii_factura(cheie, an, luna):
    """Returneaza (linii, discount, cod_alerta, explicatie). Fiecare linie: (nume, cod, cant, unitate, pret).

    cod_alerta = codul din aplicatie (backend/app/rules.py) sau None pentru o factura corecta.
    """
    if cheie == "telconet":
        # Contract: 20,00 lei; din ian. 2026 maxim +5,6% = 21,12 lei
        if an == 2025:
            pret = 20.00
        elif luna <= 2:
            pret = 21.12
        else:
            pret = 22.40  # +12% fata de 2025, peste IPC
        linii = [("Abonament Business 50GB", "BUS50", 5, "H87", pret)]
        if pret > 21.12:
            return linii, 0.0, "PRICE", "pret 22,40 > maxim 21,12 dupa indexare (Art. 5)"
        return linii, 0.0, None, ""

    if cheie == "cleanpro":
        pret = 1600.00 if (an, luna) == (2026, 6) else 1450.00
        linii = [("Servicii curatenie birou - luna", "CUR-LUNA", 1, "C62", pret)]
        if pret > 1450:
            return linii, 0.0, "PRICE", "pret 1.600 > 1.450, pret fix (Art. 4)"
        return linii, 0.0, None, ""

    # softnet: 20 licente x 115 lei, discount 10% pana la 31.03.2026
    cant = 23 if (an, luna) == (2026, 9) else 20
    linii = [("Licenta SoftNet CRM - lunar", "CRM-LIC", cant, "H87", 115.00)]
    if (an, luna) == (2026, 8):
        linii.append(("Suport premium", "SUP-PREM", 1, "C62", 250.00))
    discount_valabil = (an, luna) <= (2026, 3)
    discount_aplicat = discount_valabil and (an, luna) not in [(2026, 1), (2026, 2), (2026, 3)]
    discount = round(cant * 115.00 * 0.10, 2) if discount_aplicat else 0.0

    if discount_valabil and not discount_aplicat:
        return linii, discount, "PRICE", "lipseste discountul de 10% valabil pana la 31.03.2026 (Art. 5)"
    if cant > 20:
        return linii, discount, "QUANTITY", "23 licente facturate > 20 contractate, fara act aditional (Art. 6)"
    if len(linii) > 1:
        return linii, discount, "NEW_LINE", "linie noua 'Suport premium' care nu apare in contract (Art. 4)"
    return linii, discount, None, ""


def party(p):
    return f"""<cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>{p['strada']}</cbc:StreetName>
        <cbc:CityName>{p['oras']}</cbc:CityName>
        <cbc:CountrySubentity>{p['judet']}</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>{p['cui']}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>{p['nume']}</cbc:RegistrationName>
        <cbc:CompanyID>{p['reg']}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>"""


TAX_CAT = f"""<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>{TVA}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>"""


def xml_factura(cheie, nr, an, luna, linii, discount):
    f = FURNIZORI[cheie]
    emis = date(an, luna, 1).isoformat()
    scadent = date.fromordinal(date(an, luna, 1).toordinal() + TERMEN_PLATA[cheie]).isoformat()
    sfarsit = date(an + (luna == 12), luna % 12 + 1, 1).toordinal() - 1
    sfarsit = date.fromordinal(sfarsit).isoformat()

    total_linii = round(sum(c * p for _, _, c, _, p in linii), 2)
    baza = round(total_linii - discount, 2)
    tva = round(baza * TVA / 100, 2)

    xml_linii = ""
    for i, (nume, cod, cant, um, pret) in enumerate(linii, 1):
        xml_linii += f"""
  <cac:InvoiceLine>
    <cbc:ID>{i}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="{um}">{cant}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">{cant * pret:.2f}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>{nume}</cbc:Name>
      <cac:SellersItemIdentification><cbc:ID>{cod}</cbc:ID></cac:SellersItemIdentification>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>{TVA}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">{pret:.2f}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>"""

    xml_discount = ""
    if discount:
        xml_discount = f"""
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason>Discount contractual 10%</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="RON">{discount:.2f}</cbc:Amount>
    {TAX_CAT}
  </cac:AllowanceCharge>"""

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>{nr}</cbc:ID>
  <cbc:IssueDate>{emis}</cbc:IssueDate>
  <cbc:DueDate>{scadent}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:Note>Document fictiv pentru demo</cbc:Note>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod><cbc:StartDate>{emis}</cbc:StartDate><cbc:EndDate>{sfarsit}</cbc:EndDate></cac:InvoicePeriod>
  <cac:ContractDocumentReference><cbc:ID>{f['contract']}</cbc:ID></cac:ContractDocumentReference>
  <cac:AccountingSupplierParty>
    {party(f)}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    {party(CLIENT)}
  </cac:AccountingCustomerParty>{xml_discount}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">{tva:.2f}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="RON">{baza:.2f}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="RON">{tva:.2f}</cbc:TaxAmount>
      {TAX_CAT}
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="RON">{total_linii:.2f}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">{baza:.2f}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">{baza + tva:.2f}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="RON">{discount:.2f}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="RON">{baza + tva:.2f}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>{xml_linii}
</Invoice>
"""


def genereaza_facturi():
    """Scrie XML-urile, rezultatele asteptate si plati.csv (fiecare factura platita integral la scadenta)."""
    rezultate, plati = [], []
    for cheie, f in FURNIZORI.items():
        folder = OUT / "facturi" / cheie
        folder.mkdir(parents=True, exist_ok=True)
        for i, (an, luna) in enumerate(LUNI, 1):
            nr = f"{f['prefix']}-{an}{luna:02d}-{i:03d}"
            linii, discount, cod, explicatie = linii_factura(cheie, an, luna)
            (folder / f"{an}-{luna:02d}.xml").write_text(
                xml_factura(cheie, nr, an, luna, linii, discount), encoding="utf-8")
            rezultate.append({"furnizor": f["nume"], "fisier": f"facturi/{cheie}/{an}-{luna:02d}.xml",
                              "nr_factura": nr, "luna": f"{an}-{luna:02d}",
                              "alerte_asteptate": [cod] if cod else [], "explicatie": explicatie or "corecta"})
            baza = round(sum(c * p for _, _, c, _, p in linii) - discount, 2)
            scadent = date.fromordinal(date(an, luna, 1).toordinal() + TERMEN_PLATA[cheie])
            plati.append(f"{nr};{f['cui']};{scadent.isoformat()};{baza + round(baza * TVA / 100, 2):.2f};banca")
    (OUT / "rezultate_asteptate.json").write_text(
        json.dumps(rezultate, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "plati.csv").write_text("numar_factura;cui_furnizor;data;suma;metoda\n" + "\n".join(plati) + "\n",
                                   encoding="utf-8")
    return rezultate


if __name__ == "__main__":
    genereaza_contracte()
    rez = genereaza_facturi()
    probleme = [r for r in rez if r["alerte_asteptate"]]
    print(f"3 contracte PDF, {len(rez)} facturi XML, plati.csv, {len(probleme)} nepotriviri ascunse:")
    for r in probleme:
        print(f"  {r['luna']}  {r['furnizor']:24} {r['alerte_asteptate'][0]:9} {r['explicatie']}")
