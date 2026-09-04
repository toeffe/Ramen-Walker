#!/usr/bin/env python3
"""Batch-synthesize Ramen Walker voice lines via a locally-hosted IndexTTS2
Gradio webui (the official index-tts/index-tts webui.py, V2.5 by default).

Prerequisites
--------------
1. Your local IndexTTS2 webui.py must already be running
   (default: http://127.0.0.1:7860).
2. `pip install gradio_client` in whatever Python env can reach it.
3. Run `npm run export:lines` first so lines.json has emo_text/emo_alpha.

ALWAYS run --discover first
----------------------------
This script calls `/gen_single` with POSITIONAL arguments in the exact order
webui.py wires up `gen_button.click(gen_single, inputs=[...])`:

    emo_control_method, prompt_audio, input_text_single, lang_dropdown,
    emo_upload, emo_weight, vec1..vec8, emo_text, emo_random,
    max_text_tokens_per_segment, duration_factor,
    do_sample, top_p, top_k, temperature, length_penalty, num_beams,
    repetition_penalty, max_mel_tokens

That's 26 positional values. If your webui.py is an older version or a fork
(no `lang_dropdown`/`duration_factor`, or a different emotion-control
layout), this order won't match and the call will fail or mis-map — run
`python scripts/gen_voice.py --discover` and compare the printed parameter
list/count to PARAM_COUNT below before generating anything for real.

The "emotion from text description" gotcha (CONFIRMED on this project)
-------------------------------------------------------------------------
dialogue.ts assumes IndexTTS2's *text-description* emotion mode
(emo_control_method index 3, "use_emo_text"). Running `--discover` against
a real official webui.py confirmed `emo_control_method` only exposes 3
choices over the API:

    'Same as the voice reference', 'Use emotion reference audio', 'Use emotion vectors'

The 4th, text-description mode is hidden behind the "experimental
features" checkbox in the browser UI and excluded from the Radio's
`choices` at the API level (EMO_CHOICES_OFFICIAL = EMO_CHOICES_ALL[:-1]).
A stateless API client (this script) never toggles that checkbox, so
`emo_text` is accepted as a parameter but can't actually be selected —
sending EMO_CONTROL_METHOD_LABEL as-is will fail client-side validation
(it's not one of the 3 valid Literal values).

Fix: edit your local webui.py, then restart the server:

    EMO_CHOICES_OFFICIAL = EMO_CHOICES_ALL[:-1]   # change to:
    EMO_CHOICES_OFFICIAL = EMO_CHOICES_ALL

(Requires LOAD_QWEN_EMO, which is on by default unless your GPU was
detected as low-VRAM — pass `--qwen_emo` when launching webui.py if so.)

After patching + restarting, re-run `--discover` and confirm
`emo_control_method` now lists a 4th choice. On the official webui.py it's
"Use text description to control emotion" (already the default below) —
if your fork prints something different, pass it via `--emo-label "..."`.

Usage
-----
    python scripts/gen_voice.py --discover
    python scripts/gen_voice.py --dry-run
    python scripts/gen_voice.py --only RAMEN
    python scripts/gen_voice.py --ids ramen_dont_spill,you_okay
    python scripts/gen_voice.py --force
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOUND_DIR = REPO_ROOT / "src" / "soundassets"
LINES_JSON = SOUND_DIR / "lines.json"

GRADIO_URL = "http://127.0.0.1:7860"
API_NAME = "/gen_single"
PARAM_COUNT = 26  # see module docstring — verify against --discover

# Index 3 in IndexTTS2's EMO_CHOICES_ALL — "emotion from text description".
# Verify the exact label your local UI shows via --discover and edit if needed.
EMO_CONTROL_METHOD_LABEL = "Use text description to control emotion"
LANG_DEFAULT = "EN"  # webui's lang_dropdown is Literal['ZH','EN','JA','AR','ES']

# webui.py advanced-params defaults (do_sample, top_p, top_k, temperature,
# length_penalty, num_beams, repetition_penalty, max_mel_tokens)
ADVANCED_DEFAULTS = (True, 0.8, 30, 0.8, 0.0, 3, 10.0, 1500)

# who -> reference clip in src/soundassets (matches SPEAKER_REF in dialogue.ts)
SPEAKER_REF = {
    "YOU": "ref_you.mp3",
    "RAMEN": "ref_ramen.mp3",
    "SENTINEL": "ref_sentinel.mp3",
    "WATCHER": "ref_watcher.mp3",
    "THE HUNGER": "ref_hunger.mp3",
    # No dedicated clip recorded — reuses YOU's voice on purpose (The Other
    # is meant to read as an echo of the player). See dialogue.ts.
    "THE OTHER": "ref_you.mp3",
}


def discover(url: str) -> None:
    from gradio_client import Client

    print(f"Connecting to {url} ...")
    client = Client(url)
    client.view_api(print_info=True)
    print(
        f"\nThis script sends {PARAM_COUNT} positional args to {API_NAME} "
        "(see module docstring for the exact order). Compare that to the "
        "parameter list printed above before running for real.\n"
        "Also check 'emo_control_method' includes a text-description choice "
        "— if not, see the docstring for the one-line webui.py fix."
    )


def load_lines() -> list[dict]:
    if not LINES_JSON.exists():
        sys.exit(f"Missing {LINES_JSON} — run `npm run export:lines` first.")
    return json.loads(LINES_JSON.read_text(encoding="utf-8"))


def _extract_filepath(result) -> str:
    """gradio_client's Audio output can come back as a plain path string, a
    FileData-shaped dict ({'path': ..., 'url': ..., ...}), a gr.update()
    dict ({'value': ..., '__type__': 'update', ...}), or a (list/tuple)
    wrapping any of those — unwrap recursively whichever shape this server
    returns."""
    if isinstance(result, (list, tuple)):
        return _extract_filepath(result[0])
    if isinstance(result, dict):
        for key in ("path", "name", "value"):
            val = result.get(key)
            if val:
                return _extract_filepath(val)
        raise ValueError(f"Couldn't find a file path in result dict: {result!r}")
    return result


def build_args(row: dict, ref_path: Path, emo_label: str, lang: str) -> tuple:
    from gradio_client import handle_file

    ref_file = handle_file(str(ref_path))
    return (
        emo_label,          # emo_control_method
        ref_file,            # prompt_audio
        row["dialog"],       # input_text_single
        lang,                # lang_dropdown
        ref_file,             # emo_ref_path — marked required by the API; unused when
                             # emo_control_method != "Use emotion reference audio", but
                             # gradio_client rejects None for required Audio inputs, so
                             # we pass the voice-reference clip itself as a harmless filler.
        float(row["emo_alpha"]),  # emo_weight
        0, 0, 0, 0, 0, 0, 0, 0,    # vec1..vec8 (unused in text-description mode)
        row["emo_text"],     # emo_text
        False,               # emo_random
        120,                 # max_text_tokens_per_segment
        1.0,                 # duration_factor
        *ADVANCED_DEFAULTS,  # do_sample, top_p, top_k, temperature, length_penalty, num_beams, repetition_penalty, max_mel_tokens
    )


def _preflight_check_emo_label(client, api_name: str, emo_label: str) -> None:
    """Best-effort check that emo_label is a valid emo_control_method choice
    before burning API calls. Exits with a clear message on a confirmed
    mismatch; degrades silently if the schema can't be introspected."""
    try:
        info = client.view_api(print_info=False, return_format="dict")
        endpoints = {**info.get("named_endpoints", {}), **info.get("unnamed_endpoints", {})}
        ep = endpoints.get(api_name)
        if not ep:
            return
        for param in ep.get("parameters", []):
            if param.get("parameter_name") == "emo_control_method":
                choices = param.get("python_type", {}).get("choices") or param.get("choices")
                if choices and emo_label not in choices:
                    sys.exit(
                        f"\n'{emo_label}' is not a valid emo_control_method choice on this "
                        f"server. Valid choices: {choices}\n\n"
                        "The text-description mode is likely hidden behind webui.py's "
                        "experimental-features checkbox — see this script's module "
                        "docstring for the one-line fix + restart, then re-run --discover "
                        "to get the exact label and pass it via --emo-label."
                    )
                return
    except Exception:
        return  # best-effort only — don't block a run just because introspection failed


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--url", default=GRADIO_URL, help=f"Gradio server URL (default: {GRADIO_URL})")
    p.add_argument("--api-name", default=API_NAME, help=f"gen_single api_name (default: {API_NAME})")
    p.add_argument("--emo-label", default=EMO_CONTROL_METHOD_LABEL, help="Exact Radio label for text-description mode")
    p.add_argument("--lang", default=LANG_DEFAULT, help=f"lang_dropdown value (default: {LANG_DEFAULT})")
    p.add_argument("--discover", action="store_true", help="Print the live API schema and exit")
    p.add_argument("--dry-run", action="store_true", help="Print planned calls without contacting the server")
    p.add_argument("--force", action="store_true", help="Regenerate even if the .wav already exists")
    p.add_argument("--only", help="Only generate lines for this speaker (matches 'who', e.g. RAMEN)")
    p.add_argument("--ids", help="Comma-separated file stems to generate (e.g. you_okay,ramen_deal)")
    p.add_argument("--sleep", type=float, default=0.5, help="Seconds to sleep between calls (default: 0.5)")
    args = p.parse_args()

    if args.discover:
        discover(args.url)
        return

    rows = load_lines()

    if args.only:
        rows = [r for r in rows if r["who"] == args.only]
    if args.ids:
        wanted = {s.strip() for s in args.ids.split(",") if s.strip()}
        rows = [r for r in rows if Path(r["file"]).stem in wanted]

    todo = []
    skipped_existing = 0
    missing_ref: list[str] = []
    for row in rows:
        out_path = SOUND_DIR / row["file"]
        if out_path.exists() and not args.force:
            skipped_existing += 1
            continue
        ref_name = SPEAKER_REF.get(row["who"])
        ref_path = SOUND_DIR / ref_name if ref_name else None
        if not ref_path or not ref_path.exists():
            missing_ref.append(f"{row['file']} ({row['who']} -> {ref_name})")
            continue
        todo.append((row, ref_path))

    print(f"{len(rows)} lines selected, {skipped_existing} already have audio, "
          f"{len(missing_ref)} missing a reference clip, {len(todo)} to generate.")
    if missing_ref:
        print("\nSkipped (no reference clip yet) — record/drop these into src/soundassets first:")
        for m in missing_ref:
            print(f"  - {m}")

    if args.dry_run or not todo:
        print("\nPlanned calls:" if args.dry_run else "\nNothing to do.")
        for row, ref_path in todo:
            print(f"  {row['file']:32s} [{row['who']:10s}] ref={ref_path.name}  emo_alpha={row['emo_alpha']}")
        return

    from gradio_client import Client

    print(f"\nConnecting to {args.url} ...")
    client = Client(args.url)
    _preflight_check_emo_label(client, args.api_name, args.emo_label)

    ok, failed = 0, []
    for row, ref_path in todo:
        out_path = SOUND_DIR / row["file"]
        print(f"-> {row['file']} [{row['who']}] {row['dialog']!r}")
        try:
            call_args = build_args(row, ref_path, args.emo_label, args.lang)
            result = client.predict(*call_args, api_name=args.api_name)
            src = Path(_extract_filepath(result))
            shutil.copyfile(src, out_path)
            print(f"   saved -> {out_path}")
            ok += 1
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"   FAILED: {exc}")
            failed.append(row["file"])
        time.sleep(args.sleep)

    print(f"\nDone. {ok} generated, {len(failed)} failed.")
    if failed:
        print("Failed lines:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
