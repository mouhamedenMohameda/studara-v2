"""Replace hardcoded old colors with Colors.xxx constants across all screens."""
import os, re

BASE = '/Users/mohameda/Desktop/tawjeeh/src'

# ── Replacement rules (ordered: longest match first) ─────────────────────────
# Each tuple: (pattern_regex, replacement)
RULES = [
    # JSX prop string  →  {Colors.xxx}
    (r'backgroundColor="#064E3B"',   'backgroundColor={Colors.primaryDark}'),
    (r'backgroundColor="#059669"',   'backgroundColor={Colors.primary}'),
    (r'tintColor="#059669"',         'tintColor={Colors.primary}'),
    (r'color="#059669"',             'color={Colors.primary}'),
    (r'color="#064E3B"',             'color={Colors.primaryDark}'),

    # JS object literal  →  Colors.xxx  (single quotes)
    (r"backgroundColor: '#064E3B'",  "backgroundColor: Colors.primaryDark"),
    (r"backgroundColor: '#059669'",  "backgroundColor: Colors.primary"),
    (r"borderColor: '#059669'",      "borderColor: Colors.primary"),
    (r"borderColor: '#064E3B'",      "borderColor: Colors.primaryDark"),
    (r"color: '#064E3B'",            "color: Colors.primaryDark"),
    (r"color: '#059669'",            "color: Colors.primary"),
    (r"color: '#05966999'",          "color: Colors.primary + '99'"),
    (r"fill: '#059669'",             "fill: Colors.primary"),

    # color() call or string in size=
    (r"color=\{['\"](#059669)['\"]\}",   "color={Colors.primary}"),

    # inline ternary color values (catch remaining bare strings)
    (r": '#064E3B'",  ": Colors.primaryDark"),
    (r": '#059669'",  ": Colors.primary"),
    (r"'#064E3B'",    "Colors.primaryDark"),
    (r"'#059669'",    "Colors.primary"),
]

# Files to patch
TARGET_DIRS = [
    os.path.join(BASE, 'screens'),
    os.path.join(BASE, 'components'),
]

SKIP = {'LogoMark.tsx', 'colors.ts'}

# Files that already have a Colors import (checked manually or via grep)
NEEDS_IMPORT_CHECK = True

def needs_colors_import(code: str) -> bool:
    return 'Colors' in code and "from '../../theme'" not in code and "from '../theme'" not in code and "from '../../theme/colors'" not in code and "from '../../../theme'" not in code

def add_colors_import(code: str, filepath: str) -> str:
    """Add Colors import if it's used but not imported."""
    # Count depth relative to src/
    rel = os.path.relpath(filepath, BASE)
    depth = len(rel.split(os.sep)) - 1
    rel_path = '../' * depth + 'theme'

    import_line = f"import {{ Colors }} from '{rel_path}';"

    # insert after last existing import line
    lines = code.split('\n')
    last_import = 0
    for i, line in enumerate(lines):
        if line.startswith('import '):
            last_import = i
    lines.insert(last_import + 1, import_line)
    return '\n'.join(lines)

changed_files = []

for target_dir in TARGET_DIRS:
    for root, dirs, files in os.walk(target_dir):
        for fname in files:
            if not (fname.endswith('.tsx') or fname.endswith('.ts')):
                continue
            if fname in SKIP:
                continue

            fpath = os.path.join(root, fname)
            with open(fpath, encoding='utf-8') as f:
                original = f.read()

            code = original
            for pattern, replacement in RULES:
                code = re.sub(re.escape(pattern), replacement, code)

            if code != original:
                # Check if Colors is now used but not imported
                if 'Colors.' in code:
                    has_colors_import = bool(re.search(
                        r"import\s+\{[^}]*Colors[^}]*\}\s+from\s+['\"]", code
                    ))
                    if not has_colors_import:
                        # Determine relative import path
                        rel = os.path.relpath(fpath, BASE)
                        depth = len(rel.split(os.sep)) - 1
                        rel_path = '../' * depth + 'theme'
                        import_line = f"import {{ Colors }} from '{rel_path}';\n"

                        # Insert after last import block
                        lines = code.split('\n')
                        last_import_idx = 0
                        for i, line in enumerate(lines):
                            if line.strip().startswith('import '):
                                last_import_idx = i
                        lines.insert(last_import_idx + 1, import_line.rstrip())
                        code = '\n'.join(lines)

                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(code)
                changed_files.append(os.path.relpath(fpath, BASE))
                print(f'  ✅ {os.path.relpath(fpath, BASE)}')

print(f'\n{len(changed_files)} files updated.')
