"""Independent ReportLab input PDFs. All customer data below is fictional."""
from pathlib import Path
from copy import deepcopy
import json
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'tests/fixtures/input'
OUT.mkdir(parents=True,exist_ok=True)
layout=json.loads((ROOT/'tests/fixtures/layout.json').read_text(encoding='utf-8'))
pdfmetrics.registerFont(TTFont('TestSans',str(ROOT/'public/assets/regular.ttf')))
BASE=dict(sourceIssueDate='2026-06-04',sourceValidUntil='2026-08-31',eventDate='2026-05-21',inspectionDate='2026-05-28',claimNumber='TEST-1001/2026',policyholder='ООО «Тестовый страхователь»',policyNumber='TEST-395-1001',deductible='0,00',carModel='FORD MONDEO 2,0',vin='XTA12345678901234',registration='А123АА178',year='2016',mileage='231524',color='Серебристый',mainStationName='ООО «Тестовый автосервис»',mainStationAddress='Санкт-Петербург, Тестовая улица, д. 15',mainStationPhone='+7 (000) 000-00-01',victimName='Сотрудник 001',victimPhone='+7 (000) 000-00-02',sourceNotes='')
cases=[('01-standard',{}),('02-long-names',dict(policyholder='Общество с ограниченной ответственностью «Северо-Западный испытательный автотранспортный комплекс»',victimName='Представитель с длинным обозначением для проверки переноса строк',mainStationName='ООО «Многопрофильный центр технического обслуживания автомобилей»',mainStationAddress='Ленинградская область, Всеволожский район, Тестовое поселение, Производственная улица, дом 125, корпус 3')),
('03-missing-vin',dict(vin='')),('04-missing-victim',dict(victimName='',victimPhone='',color='')),('05-nonzero-deductible',dict(deductible='25 500,75',mileage='0',year='2026',carModel='LADA VESTA')),
('06-leap-dates',dict(sourceIssueDate='2024-02-29',sourceValidUntil='2024-04-29',eventDate='2024-02-28',inspectionDate='2024-02-29')),
('07-punctuation',dict(policyholder='ООО «Тест & Партнёры»',mainStationName='ИП Представитель 001 / СТО № 2',mainStationAddress='г. Москва, ул. «Тестовая», д. 7/2',carModel='MERCEDES-BENZ GLC 300 4MATIC',claimNumber='TEST-007/26')),
('08-blank-fields',dict(policyNumber='',mainStationPhone='',registration='')),
('09-multiline',dict(policyholder='ООО «Испытания»\nПредставитель: Представитель 001',mainStationAddress='Санкт-Петербург\nТестовая улица, дом 1')),
('10-invalid-vin',dict(vin='XTA1234567890123O')),
('11-short-dates',dict(sourceIssueDate='2026-01-31',sourceValidUntil='2026-03-31')),
('12-large-values',dict(mileage='9999999',deductible='999 999,99',carModel='LAND ROVER RANGE ROVER SPORT 3.0 TDV6'))]
def date(v,short=False):
 if not v:return ''
 y,m,d=v.split('-');return f'{d}.{m}.{y[2:] if short else y}'
def draw_text(c,text,box,maxsize=9):
 if not text:return
 x,y,w,h=box
 for quarter in range(round(maxsize*4),19,-1):
  size=quarter/4;lines=[]
  for paragraph in text.split('\n'):
   line=''
   for word in paragraph.split(' '):
    candidate=(line+' '+word).strip()
    if pdfmetrics.stringWidth(candidate,'TestSans',size)<=w-4:line=candidate
    else:
     if line:lines.append(line)
     line=word
   lines.append(line)
  if len(lines)*size*1.12<=h-2:break
 c.setFont('TestSans',size)
 for i,line in enumerate(lines):c.drawString(x+2,842-y-size-1-i*size*1.12,line)
def create(path,data,short=False,scan=False,pages=1):
 c=canvas.Canvas(str(path),pagesize=(595,842));c.setTitle('Синтетический тестовый документ')
 for _ in range(pages):
  c.drawImage(str(ROOT/'public/assets/template.png'),0,0,width=595,height=842)
  if not scan:
   # The raster artwork remains unchanged; an invisible selectable label layer
   # models the real source form and lets structural recognition be tested.
   labels=[('Дата направления',20.75,87.2),('Действует до',169.5,87.2),('Марка/',298.25,87.2),('VIN/шасси/',298.25,111.45),('Страхователь',20.75,133.95),('Договор',20.75,159.45),('Список повреждений',24.55,185.5),('Примечания:',298.25,185.5),('СТОА',299.75,391.8),('Адрес',299.75,406.8),('Телефон',299.75,431.3),('Потерпевший',298.25,792.15)]
   for label,x,y in labels:
    t=c.beginText(x,842-y);t.setFont('TestSans',8);t.setTextRenderMode(3);t.textOut(label);c.drawText(t)
   c.setFillColorRGB(1,1,1);c.rect(295,768,285,62,stroke=0,fill=1);c.setFillColorRGB(0,0,0)
   c.setFont('TestSans',14);c.drawRightString(570,817,'НАПРАВЛЕНИЕ НА РЕМОНТ КАСКО')
   c.setFont('TestSans',8);c.drawRightString(570,798,'«Совкомбанк страхование» (АО). sovcomins.ru')
   c.drawRightString(570,784,'СИНТЕТИЧЕСКИЙ ДОКУМЕНТ ДЛЯ ТЕСТИРОВАНИЯ')
   mapping={**data,'issueDate':date(data['sourceIssueDate'],short),'validUntil':date(data['sourceValidUntil'],short)+' 0:00','eventDate':date(data['eventDate'],short),'inspectionDate':date(data['inspectionDate'],short),'stationName':data['mainStationName'],'stationAddress':data['mainStationAddress'],'stationPhone':data['mainStationPhone'],'insurerRepresentative':'Исходный Сотрудник Тестовый'}
   for key,box in layout['fields'].items():
    if key!='notes':draw_text(c,mapping.get(key,''),box,8 if key in ['eventDate','inspectionDate'] else 9)
   notes='Фара правая - замена крепления;'
   if data['victimName']:notes+='\n\nПотерпевший (представитель): '+data['victimName']
   if data['victimPhone']:notes+='\n(Тел.: '+data['victimPhone']+')'
   draw_text(c,notes,layout['fields']['notes'])
  c.showPage()
 c.save()
manifest=[]
for name,changes in cases:
 data={**BASE,**changes};create(OUT/(name+'.pdf'),data,name=='11-short-dates');manifest.append(dict(file=name+'.pdf',data=data))
create(OUT/'13-image-only.pdf',BASE,scan=True)
create(OUT/'14-multipage.pdf',BASE,pages=2)
c=canvas.Canvas(str(OUT/'15-wrong-form.pdf'),pagesize=(595,842));c.setFont('TestSans',12);c.drawString(60,700,'Другой документ, не направление на ремонт.');c.save()
(OUT/'16-damaged.pdf').write_bytes(b'%PDF-1.7\nThis is a deliberately broken PDF fixture.')
(OUT/'17-not-pdf.pdf').write_text('Это не PDF',encoding='utf-8')
(ROOT/'tests/fixtures/expected.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Created 17 synthetic input files, with 12 independent expected datasets.')
