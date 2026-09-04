import json
import urllib.request

r = urllib.request.urlopen("http://tts:8000/v1/registry", timeout=15)
data = json.loads(r.read())
items = data if isinstance(data, list) else data.get("data", data)
for item in items:
    if isinstance(item, dict) and item.get("language") and "ru" in str(item.get("language")).lower():
        print(json.dumps(item, ensure_ascii=False))
