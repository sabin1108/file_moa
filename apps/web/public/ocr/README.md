# 같은 origin에서 제공하는 OCR 파일

엔진은 `tesseract.js@7.0.0`이며 사용자가2026-11-10 추가를 승인했다. 한국어/영어 인식 데이터는 공식 `tesseract-ocr/tessdata_fast`의 `languages.json`에 기록한 고정 revision에서 내려받았다. 각 파일의 SHA-256·크기·출처를 기록하며 라이선스는 `lang/LICENSE`에 보존한다.

Worker와 core/WASM은 `scripts/prepare-ocr-assets.mjs`가 설치된 정확한 엔진/lockfile 버전에서 복사한다. 이 복사본은 Git에서 제외하고 dev/build 전에 준비한다. 이 스크립트는 네트워크를 사용하지 않고 인식 파일 해시를 확인한다. `pnpm-workspace.yaml`의 tesseract postinstall은false이며 후원 안내 스크립트를 실행하지 않는다.

런타임의 `workerPath`, `corePath`, `langPath`를 모두 `/ocr/`의 같은 origin으로 지정한다. 기본 CDN·언어 데이터 다운로드 주소로 대체하지 않는다. 인식 데이터가 없거나 변경되면 준비/빌드를 실패시킨다. OCR은 기본 꺼짐이며 연결 관리 또는 미리보기 실패 안내에서 켠다. 원본 이미지·PDF는 로컬 Worker 메모리 안에서 처리하고, 인식 텍스트의 외부 전송은 기존 자료 발췌 확인/동의를 별도로 따른다.

공식 근거: https://github.com/naptha/tesseract.js/tree/v7.0.0 · https://github.com/tesseract-ocr/tessdata_fast
