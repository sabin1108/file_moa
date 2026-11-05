import { libraryFiles, portfolioNames, selectedFiles } from "./library-data";

// 정적 폴더 구조 예시. 원본 경로나 브라우저 파일 핸들은 사용하지 않습니다.
export const studyFolder = "프론트엔드 공부";
export const portfolioFolder = "포트폴리오";
export const sourceFolder = "React";
export const targetFolder = "프로젝트 기록";

export const studyGroups = [
  { name: sourceFolder, files: libraryFiles.slice(0, 3).map(file => file.name), selected: true, wide: true },
  { name: "언어 · 기초", files: [libraryFiles[5].name, libraryFiles[7].name], selected: false, wide: false },
  { name: "설계 · 웹 품질", files: [libraryFiles[3].name, libraryFiles[4].name, libraryFiles[6].name], selected: false, wide: false },
];
export const portfolioGroups = [
  { name: targetFolder, files: portfolioNames.slice(0, 3), target: true },
  { name: "이력서 · 회고", files: portfolioNames.slice(3), target: false },
];
export const selectedNames = new Set<string>(selectedFiles.map(file => file.name));
