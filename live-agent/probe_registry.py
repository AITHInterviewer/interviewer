import json
import urllib.request

r = urllib.request.urlopen("http://tts:8000/openapi.json", timeout=10)
spec = json.loads(r.read())
for path in sorted(spec.get("paths", {})):
    if "model" in path or "registry" in path or "voice" in path:
        print(path)
