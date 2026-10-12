"""Native folder picker, run as a separate process by app.py (Streamlit cannot open OS dialogs).
Prints the chosen folder, or nothing if cancelled. Works only when the app runs on this PC."""
import sys


def main() -> int:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)  # keep the dialog in front of the browser
    init = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    title = sys.argv[2] if len(sys.argv) > 2 else "Select folder"
    path = filedialog.askdirectory(initialdir=init, title=title, mustexist=True, parent=root)
    root.destroy()
    print(path or "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
