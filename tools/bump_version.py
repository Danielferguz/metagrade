"""Pone ?v=<versión> en todos los imports de módulos, la hoja de estilos y el script principal,
para que el navegador (y la caché de GitHub Pages) carguen siempre la versión nueva.
Uso: python3 tools/bump_version.py 2026.10.15-3"""
import re, sys, pathlib
v = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
for f in list((root / 'js').glob('*.js')) + [root / 'index.html']:
    s = f.read_text(encoding='utf-8')
    s = re.sub(r"""(from\s+['"]\./[\w-]+\.js)(\?v=[^'"]*)?(['"])""", rf"\1?v={v}\3", s)
    s = re.sub(r"""(src="js/app\.js)(\?v=[^"]*)?(")""", rf"\1?v={v}\3", s)
    s = re.sub(r"""(href="css/style\.css)(\?v=[^"]*)?(")""", rf"\1?v={v}\3", s)
    s = re.sub(r"""(<span id="app-version">)[^<]*(</span>)""", rf"\g<1>{v}\2", s)
    f.write_text(s, encoding='utf-8')
print('versión', v)
