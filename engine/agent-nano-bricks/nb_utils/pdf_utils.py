"""PDF read (pypdf) and PDF generation (fpdf2). Clear errors if libraries missing."""
from pathlib import Path


def read(path):
    """Extract text from a PDF file. Returns full text as a string."""
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
    except ImportError:
        raise RuntimeError("PDF reading requires pypdf. Run: pip install pypdf")
    reader = PdfReader(str(path))
    return "\n\n".join((p.extract_text() or "") for p in reader.pages)


def read_pages(path):
    """Extract text page by page. Returns list of strings (one per page)."""
    try:
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader
    except ImportError:
        raise RuntimeError("PDF reading requires pypdf. Run: pip install pypdf")
    reader = PdfReader(str(path))
    return [(p.extract_text() or "") for p in reader.pages]


def generate(path, content, title="", font_size=11, line_height=6):
    """Generate a PDF from plain text / markdown-ish content.
    Handles multi-line text and basic Markdown headings (#, ##).
    """
    try:
        from fpdf import FPDF
    except ImportError:
        raise RuntimeError("PDF generation requires fpdf2. Run: pip install fpdf2")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    if title:
        pdf.set_font("Helvetica", "B", 16)
        _safe_cell(pdf, title)
        pdf.ln(4)
    for line in content.split("\n"):
        if line.startswith("### "):
            pdf.set_font("Helvetica", "B", font_size + 1)
            _safe_cell(pdf, line[4:], line_height)
        elif line.startswith("## "):
            pdf.set_font("Helvetica", "B", font_size + 3)
            _safe_cell(pdf, line[3:], line_height + 2)
        elif line.startswith("# "):
            pdf.set_font("Helvetica", "B", font_size + 5)
            _safe_cell(pdf, line[2:], line_height + 4)
        else:
            pdf.set_font("Helvetica", size=font_size)
            _safe_cell(pdf, line or " ", line_height)
    pdf.output(str(path))


def _safe_cell(pdf, text, h=8):
    safe = text.encode("latin-1", "replace").decode("latin-1")
    pdf.multi_cell(0, h, safe)
