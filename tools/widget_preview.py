#!/usr/bin/env python3
"""Rigenera le anteprime dei widget (selettore dei widget, Android 12+) dai layout veri.

Uso, dalla radice del repository:  python tools/widget_preview.py
Da rilanciare ogni volta che cambia il layout di un widget (widget_today*.xml, widget_last_point.xml).

Le anteprime sono copie "statiche" dei layout con dati di esempio e un solo fotogramma dell'icona del tracker (onde con due anelli,
colorata); le assegna `android:previewLayout` nei file xml/*widget*_info.xml. Sulle versioni precedenti ad Android 12 resta il layout vuoto.
"""
import os, re

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "android", "app", "src", "main"))


def rd(p):
    return open(p, encoding="utf-8").read()


def wr(p, t):
    with open(p, "w", encoding="utf-8", newline="\n") as f:
        f.write(t)


SAMPLE = {
    "w_km": "12", "w_places": "5", "w_time": "2h 10m",
    "w_km_week": "63", "w_places_week": "18", "w_time_week": "9h 45m",
    "w_ago": "0:42",
}


def preview(src, tint):
    s = rd(src)
    for i, t in SAMPLE.items():
        a = f'android:id="@+id/{i}"'
        assert s.count(a) == 1, (src, i, s.count(a))
        s = s.replace(a, f'{a}\n            android:text="{t}"')
    # icona: un solo fotogramma (pallino con due anelli) al posto del ViewFlipper delle onde; niente flipper dei passi
    s, n1 = re.subn(r'<ViewFlipper\s+android:id="@\+id/w_flip_still".*?</ViewFlipper>',
                    f'<ImageView\n                android:layout_width="23.1dp"\n                android:layout_height="23.1dp"\n                android:scaleType="fitCenter"\n                android:tint="{tint}"\n                android:src="@drawable/ic_still_2" />', s, flags=re.S)
    s, n2 = re.subn(r'\s*<ViewFlipper\s+android:id="@\+id/w_flip_steps".*?</ViewFlipper>\n', "\n", s, flags=re.S)
    assert n1 == 1 and n2 == 1, (n1, n2)
    return s


wr(r"res/layout/widget_today_preview.xml", preview(r"res/layout/widget_today.xml", "#FFFFFFFF"))
wr(r"res/layout/widget_today_dark_preview.xml", preview(r"res/layout/widget_today_dark.xml", "#FFFFFFFF"))

# widget "ultimo punto": anteprima con un esempio
lp = rd(r"res/layout/widget_last_point.xml")
lp = lp.replace('android:id="@+id/w_value"', 'android:id="@+id/w_value"\n        android:text="5 min fa"', 1)
lp = lp.replace('android:id="@+id/w_label"', 'android:id="@+id/w_label"\n        android:text="dall\'ultimo punto"', 1)
wr(r"res/layout/widget_last_point_preview.xml", lp)


def link(info, layout):
    s = rd(info)
    if "previewLayout" in s:
        s = re.sub(r'android:previewLayout="[^"]*"', f'android:previewLayout="@layout/{layout}"', s)
    else:
        s = s.replace('    android:initialLayout=', f'    android:previewLayout="@layout/{layout}"\n    android:initialLayout=', 1)
    wr(info, s)


link(r"res/xml/today_widget_info.xml", "widget_today_preview")
link(r"res/xml/today_widget_dark_info.xml", "widget_today_dark_preview")
link(r"res/xml/last_point_widget_info.xml", "widget_last_point_preview")
print("anteprime rigenerate")
