"""从加载页文案生成内嵌英文字体；运行需要 FontTools 和 Brotli。"""

from html.parser import HTMLParser
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


class WelcomeText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if self.depth or 'welcome-script' in dict(attrs).get('class', '').split():
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)


root = Path(__file__).resolve().parents[1]
parser = WelcomeText()
parser.feed((root / 'index.html').read_text(encoding='utf-8'))
text = ''.join(parser.parts)
if not text.strip():
    raise ValueError('加载页缺少 welcome-script 文案')

source = root / 'public/assets/fonts/great-vibes/RWmMoKWR9v4ksMfaWd_JN9XFiaQ.woff2'
font = TTFont(source, recalcTimestamp=False)
missing = set(map(ord, text)) - set(font.getBestCmap())
if missing:
    raise ValueError(f'原字体缺少字形：{sorted(missing)}')
options = subset.Options()
options.layout_features = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
font.flavor = 'woff2'
target = root / 'public/assets/fonts/welcome/welcome-script.woff2'
font.save(target)
print(f'{target.relative_to(root)}: {target.stat().st_size} bytes; text={text!r}')
