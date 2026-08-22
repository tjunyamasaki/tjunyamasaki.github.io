"""Write js/config.js from environment (GitHub Actions secrets)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


REQUIRED = [
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_DATABASE_URL",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
]


def js_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        print("Missing GitHub secrets: " + ", ".join(missing), file=sys.stderr)
        sys.exit(1)

    values = {name: js_string(os.environ[name].strip()) for name in REQUIRED}
    Path("js").mkdir(exist_ok=True)
    Path("js/config.js").write_text(
        f"""export const firebaseConfig = {{
  apiKey: "{values["FIREBASE_API_KEY"]}",
  authDomain: "{values["FIREBASE_AUTH_DOMAIN"]}",
  databaseURL: "{values["FIREBASE_DATABASE_URL"]}",
  projectId: "{values["FIREBASE_PROJECT_ID"]}",
  storageBucket: "{values["FIREBASE_STORAGE_BUCKET"]}",
  messagingSenderId: "{values["FIREBASE_MESSAGING_SENDER_ID"]}",
  appId: "{values["FIREBASE_APP_ID"]}",
}};

export function isFirebaseConfigured() {{
  return true;
}}
""",
        encoding="utf-8",
    )
    print("Wrote js/config.js")


if __name__ == "__main__":
    main()
