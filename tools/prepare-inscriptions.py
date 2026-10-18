"""Build the two small, offline calligraphy faces from the user's local fonts."""
import base64
import io
import os
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
FACES = [
    ('Beaconia SuShi', Path(os.environ['APPDATA']) / 'Kingsoft/office6/docerFonts/苏轼行书.ttf', '此心安处是吾乡'),
    ('Beaconia Huang', Path(os.environ['LOCALAPPDATA']) / 'Microsoft/Windows/Fonts/FZHuangTJXSJW.TTF', '四海同光'),
]

rules = ['/* Local inscription subsets. Rebuild with tools/prepare-inscriptions.py. */']
for family, source, text in FACES:
    font = TTFont(source)
    missing = set(map(ord, text)) - set(font.getBestCmap())
    if missing:
        raise ValueError(f'{source.name}: missing {missing}')
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.recalc_timestamp = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.flavor = 'woff2'
    output = io.BytesIO()
    font.save(output)
    payload = output.getvalue()
    encoded = base64.b64encode(payload).decode('ascii')
    unicode_range = ','.join(f'U+{ord(char):04X}' for char in sorted(set(text)))
    rules.append(f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{encoded}) format('woff2');font-weight:400;font-style:normal;font-display:swap;unicode-range:{unicode_range}}}")
    print(f'{family}: {len(payload):,} bytes / {len(set(text))} characters')

(ROOT / 'assets' / 'calligraphy-fonts.css').write_text('\n'.join(rules) + '\n', encoding='utf-8')
