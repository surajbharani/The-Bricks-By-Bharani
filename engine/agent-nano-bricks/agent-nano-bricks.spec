# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Agent Nano Bricks sidecar.
Build: pyinstaller agent-nano-bricks.spec
Output: dist/agent-nano-bricks[.exe]
"""
import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ['serve.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[
        ('prompts', 'prompts'),
    ],
    hiddenimports=[
        'openai',
        'openai.types',
        'openai.types.chat',
        'openai._client',
        'tiktoken',
        'tiktoken.registry',
        'tiktoken_ext',
        'tiktoken_ext.openai_public',
        'aiofiles',
        'aiofiles.os',
        'aiofiles.threadpool',
        'httpx',
        'httpcore',
        'anyio',
        'anyio._backends._asyncio',
        'distutils',
        # Document tools (imported lazily inside tools/executor.py)
        'pypdf',
        'docx',
        'openpyxl',
        'fpdf',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'test', 'unittest', 'xmlrpc'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='agent-nano-bricks',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,   # must be True — it uses stdin/stdout
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
