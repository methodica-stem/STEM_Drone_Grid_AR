# Drone grid (רחפן רשת) — Hebrew painted into artwork and video, with proposed Arabic

Everything here is **Claude's proposal** (marked "اقتراح" in the review version), for the Arabic reviewer to confirm or change.
Nothing is redrawn: the clean build still shows the Hebrew in these pictures until an artist redraws them from what the reviewer
approves. In `STEM-Drone-Grid-AR_REVIEW` the proposals are drawn over the pictures (a switch at the top hides them).

## Pictures (visible on a screen)

| Picture | Screen | Hebrew | Proposed Arabic | Blocking? |
|---|---|---|---|---|
| `shared-conditions-card.png` (the paper note, title ribbon) | 8 (Q4), 9 (Q5) | תנאי המשימה החדשים | شروط المهمّة الجديدة | **Title DONE 2026-11-18** (`assets-ar/images/`, both builds; the painted Hebrew bullets stay under the live-text patches, as before). The note's bullets are live text over paper patches; only the title is painted. The designer must supply the card **without** the title (open question 19 of the Hebrew build) or with the Arabic one. |
| `q7-img.png` (the dashboard board, inside the question card) | 12 (Q7) | דוח ניתוח שטח השמורה | تقرير تحليل مساحة المحمية | **DONE 2026-11-18**: Arabic picture in `assets-ar/images/` (made by the Arabic-picture script, Almarai 800), in both builds |
| | | חורש וצמחייה | أحراش ونباتات | |
| | | מקורות מים | مصادر المياه | |
| | | שבילי גישה למטפלים ומטפלות | مسارات الوصول لطواقم العمل بالمحمية | the picture was regenerated to match the live text (2026-11-12). |
| | | מתחם תצפית למבקרים ומבקרות | منطقة إطلالة للزوّار والزائرات | changed from نقطة مراقبة by the Arabic reviewer (2026-11-17). |
| `video-intro-poster.jpg` (poster, shown until the video plays) | 1 | מבצע מיפוי / שמורת שקד / יוצא לדרך! | عمليّة رسم خريطة / محمية اللوز الطبيعيّة / تنطلق! | yes (the same card is in the video); the poster is now the first frame of the Arabic video (2026-11-26) |
| `video-results-poster.jpg` | 11 | הסריקה הסתיימה ✓ | انتهى المسح ✓ | yes (the same sign is in the video); the poster is now the first frame of the Arabic video (2026-11-26) |

Fractions and digits painted in the pictures (`diagram-fixed-pie.png`, the legend values in `q7-img.png`, the grid pictures) are
numbers: nothing to translate. The corrected diagram on screen 13 is live text over a blank board.

## Finish screen: Hebrew-sector picture swapped

The Hebrew build shows `finish-bg-hemed-new.png` (the Hebrew-sector variant of the picture). The Arabic build shows the
original `finish-bg.jpg` (1920x1080, from the PSD, banner left empty for the live text), as planned in the Hebrew delivery notes.
Set in `index-ar-fixes.py`; the file is in `assets-ar/images/`.

## Video (re-produced in Arabic; captions and narration are live text / the studio script)

| Video | Screen | Hebrew painted in the frames | Proposed Arabic |
|---|---|---|---|
| `RAHFAN_RESHET_CLIP1_V3.mp4` | 1 | title card on the wall screen, 0:00 to ~0:04 and again ~0:24: מבצע מיפוי שמורת שקד יוצא לדרך! | عمليّة رسم خريطة محمية اللوز الطبيعيّة تنطلق! |
| `RAHFAN_RESHET_CLIP2_V2.mp4` | 7 | the paper note, ~0:12 to 0:22: תנאי המשימה החדשים + the two conditions | the lomda's own wording (DRONE-08-004 to 08-007) |
| `RAHFAN_RESHET_CLIP3_V2.mp4` | 9 (Q5 feedback) | none | — |
| `RAHFAN_RESHET_CLIP4_V3.mp4` | 11 | the sign "הסריקה הסתיימה ✓" (0:00 to 0:06); the board 0:17 to 0:38: דוח ניתוח שטח השמורה and the four legend lines with 1/2, 1/4, 1/5, 1/10 | انتهى المسح ✓; تقرير تحليل مساحة المحمية; أحراش ونباتات; مصادر المياه; مسارات الوصول لطواقم العمل بالمحمية; منطقة إطلالة للزوّار والزائرات |

The calendar in video 1 shows digits only. 2026-11-26: the four Arabic videos are in (the cards, the paper note, the sign and the board are painted in Arabic in them);
the studio file is `VIDEO_SCRIPT_AR.docx`.

## Names and terms (content owner's decisions, 2026-11-12; terms for the reviewer to confirm)

- **שקד** (the reserve) = **اللوز** (almond): محمية اللوز الطبيعيّة, a made-up, nature-oriented reserve name with no double meaning;
  same wording everywhere (project rule).
- **מאי** (May) = **مرام** (Arabic reviewer, 2026-11-17; was مي). Roy has no Arabic name in the learner text (only in picture file names).
- **מטפלים ומטפלות** = **طواقم رعاية الحيوانات** (the animal-care teams; gender-neutral). No Arabic source for the role was found
  (the Authority's Arabic site speaks of مفتشو الهيئة and الطاقم البيطري): reviewer to confirm.
- **מתחם תצפית** = **منطقة إطلالة** (Arabic reviewer, 2026-11-17; was نقطة مراقبة) (the Israel Nature and Parks Authority's Arabic site, ar.parks.org.il, uses نقطة مراقبة / نقطة مطل
  for visitor lookout points); **שבילי גישה** = **مسارات الوصول**; **מבקרים** = **الزوّار**; **שמורה** = **المحمية الطبيعية**
  (all as on that site).
- **Units** are spelled out, as in the glossary and the earlier lomdot (content owner): קמ"ר = كيلومتر مربّع, ק"מ = كيلومتر, with number agreement (4 كيلومترات مربّعة, 12 كيلومترا مربّعا). The glossary entry for קמ"ר is still marked PROPOSED.
- Day labels **יום א׳ / ב׳ / ג׳** = **اليوم الأول / اليوم الثاني / اليوم الثالث** (Arabic reviewer, 2026-11-17: the weekday names are wrong here; in a sentence "في اليوم الأول"). Option letters (אפשרות א / ב / ג) stay أ / ب / ت, as in the earlier lomdot (e.g. Mars: מודל ג' = النموذج "ت").
- Finish screen: the original picture (confirmed).

## Hebrew corrections made in the Hebrew build (2026-11-12, not committed yet)

Video 1 caption יצטרך → נצטרך; the stray space in "( שטח" (Q4 feedback); "העזרו ביישומון" → "היעזרו ביישומון"; a colon after "4 קמ"ר"
in the Q8 feedback; `q7-img.png` replaced by the regenerated board (the legend now reads למטפלים ומטפלות, as the live text does).
The Arabic follows the corrected Hebrew (`he-source/` is the working tree of `STEM_Drone_Grid` on top of `16a6999`).
