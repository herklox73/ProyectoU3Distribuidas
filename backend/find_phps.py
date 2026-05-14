import codecs
import re

text = codecs.open('mass_sender/static/mass_sender/funciones.js', 'r', 'utf-8', errors='ignore').read()
phps = set(re.findall(r'fetch\([\'\`\"]([^\'\`\"\)]+\.php)[?\'\`\"]', text))
print("FOUND PHPS:")
for p in phps:
    print(p)
