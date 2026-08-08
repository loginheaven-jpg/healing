import json
from music21 import converter
s = converter.parse('single_staff.midi')
notes = [n.pitch.midi for n in s.parts[0].flatten().notes]
json.dump({"Melody": notes}, open('ground_truth_single.json','w'))
print("정답:", notes)
