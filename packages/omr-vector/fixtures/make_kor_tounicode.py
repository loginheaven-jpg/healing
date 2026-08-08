# ToUnicode를 포함하는 PDF를 만들어 정상 경로를 검증한다.
# reportlab은 TrueType 임베드 시 ToUnicode CMap을 넣는다.
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import glob
cand = glob.glob("/usr/share/fonts/truetype/nanum/NanumGothic.ttf") or \
       glob.glob("/usr/share/fonts/**/NanumGothic*.ttf", recursive=True)
print("폰트:", cand[:1])
pdfmetrics.registerFont(TTFont("Nanum", cand[0]))
c = canvas.Canvas("/tmp/kor_text.pdf")
c.setFont("Nanum", 12)
for i, ch in enumerate("주를찬양하여라"):
    c.drawString(100 + i*20, 700, ch)
c.save()
print("생성 완료")
