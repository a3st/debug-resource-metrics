"""Build a dependency-free VSIX using the standard VS Code package layout."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape

root = Path(__file__).resolve().parent.parent
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
translations = json.loads((root / 'package.nls.json').read_text(encoding='utf-8'))
description = package['description']
if description.startswith('%') and description.endswith('%'):
    description = translations[description[1:-1]]
if not (root / 'out' / 'extension.js').is_file():
    raise SystemExit('Compile first: npm run compile')
name, version, publisher = (package[key] for key in ('name', 'version', 'publisher'))
output = root / f'{name}-{version}.vsix'
manifest = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
<Metadata><Identity Language="en-US" Id="{escape(name)}" Version="{escape(version)}" Publisher="{escape(publisher)}"/><DisplayName>{escape(package['displayName'])}</DisplayName><Description xml:space="preserve">{escape(description)}</Description><Tags>debug,cpu,memory,runtime</Tags><Categories>Debuggers</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="{escape(package['engines']['vscode'])}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/></Properties><License>extension/LICENSE</License></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>'''
content_types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>'''
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('extension.vsixmanifest', manifest)
    archive.writestr('[Content_Types].xml', content_types)
    for relative in ['package.json', 'README.md', 'README.ru-RU.md', 'LICENSE']:
        archive.write(root / relative, f'extension/{relative}')
    for file in sorted(root.glob('package.nls*.json')):
        archive.write(file, 'extension/' + file.name)
    for directory in ['out', 'media', 'l10n']:
        for file in sorted((root / directory).rglob('*')):
            if file.is_file():
                archive.write(file, 'extension/' + file.relative_to(root).as_posix())
print(output)
