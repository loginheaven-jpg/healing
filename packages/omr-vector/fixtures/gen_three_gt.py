import json
from music21 import converter
s = converter.parse('three_staff.midi')
out = {}
for idx, name in enumerate(["SA","TB","Acc"]):
    p = s.parts[idx]
    hi, lo = [], []
    for e in p.flatten().notes:
        ps = sorted([n.pitch.midi for n in e.notes], reverse=True) if e.isChord else [e.pitch.midi]
        hi.append(ps[0]); lo.append(ps[-1] if len(ps)>1 else ps[0])
    out[name+"_hi"] = hi; out[name+"_lo"] = lo
gt = {"Soprano": out["SA_hi"], "Alto": out["SA_lo"], "Tenor": out["TB_hi"], "Bass": out["TB_lo"]}
json.dump(gt, open('ground_truth_three.json','w'))
for k,v in gt.items(): print(k, v)
