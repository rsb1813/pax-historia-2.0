// 최초 계정 부트스트랩 시 기존 단일테넌트 데이터(시나리오/게임/맵에디터 문서)에
// ownerId를 부여하고 전역 매니페스트의 활성 선택값을 계정 설정으로 옮기는 1회성 마이그레이션
//
// idempotent: ownerId가 이미 있는 레코드는 건드리지 않는다. 두 번 실행해도
// 결과가 바뀌지 않는다(마이그레이션 버그로 재실행되어도 기존 소유권을 덮어쓰지 않음).
import fs from "fs";
import path from "path";
import url from "url";
import { patchSettings } from "./userSettings.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const SCENARIOS_DIR = path.join(DATA_DIR, "scenarios");
const GAMES_DIR = path.join(DATA_DIR, "games");
const MAP_EDITOR_DOCS_DIR = path.join(DATA_DIR, "mapeditor-documents");
const GAME_MANIFEST_PATH = path.join(DATA_DIR, "game-manifest.json");
const SCENARIO_MANIFEST_PATH = path.join(DATA_DIR, "scenario-manifest.json");

const readJsonFile = (targetPath, fallback = null) => {
  if (!fs.existsSync(targetPath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON file: ${targetPath}`, error);
    return fallback;
  }
};

const writeJsonFile = (targetPath, value) => {
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), "utf-8");
};

const listSubdirectories = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
};

const listJsonFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
};

// server/data/scenarios/<id>/scenario.json — ownerId 없는 시나리오에 ownerId+shared:true 부여
// (기존 Modern Day 등 이미 존재하던 시나리오는 마이그레이션 전까지는 공유 상태로 간주한다)
const tagScenarios = (userId) => {
  const taggedIds = [];
  for (const scenarioId of listSubdirectories(SCENARIOS_DIR)) {
    const metaPath = path.join(SCENARIOS_DIR, scenarioId, "scenario.json");
    const meta = readJsonFile(metaPath, null);
    if (!meta || meta.ownerId) continue;

    writeJsonFile(metaPath, { ...meta, ownerId: userId, shared: true });
    taggedIds.push(scenarioId);
  }
  return taggedIds;
};

// server/data/games/<id>/game-instance.json — ownerId 없는 게임에 ownerId만 부여
// (게임은 시나리오와 달리 항상 비공개이므로 shared 필드는 추가하지 않는다)
const tagGames = (userId) => {
  const taggedIds = [];
  for (const gameId of listSubdirectories(GAMES_DIR)) {
    const metaPath = path.join(GAMES_DIR, gameId, "game-instance.json");
    const meta = readJsonFile(metaPath, null);
    if (!meta || meta.ownerId) continue;

    writeJsonFile(metaPath, { ...meta, ownerId: userId });
    taggedIds.push(gameId);
  }
  return taggedIds;
};

// server/data/mapeditor-documents/<id>.json — ownerId 없는 문서에 ownerId+shared:false 부여
const tagMapEditorDocuments = (userId) => {
  const taggedIds = [];
  for (const fileName of listJsonFiles(MAP_EDITOR_DOCS_DIR)) {
    const docPath = path.join(MAP_EDITOR_DOCS_DIR, fileName);
    const doc = readJsonFile(docPath, null);
    if (!doc || doc.ownerId) continue;

    writeJsonFile(docPath, { ...doc, ownerId: userId, shared: false });
    taggedIds.push(doc.id ?? fileName.replace(/\.json$/, ""));
  }
  return taggedIds;
};

// 전역 매니페스트(game-manifest.json/scenario-manifest.json)의 활성 선택값을
// 신규 계정의 settings.json(library.activeGameId/selectedScenarioId)으로 이전한다.
const migrateActiveSelections = (userId) => {
  const gameManifest = readJsonFile(GAME_MANIFEST_PATH, {});
  const scenarioManifest = readJsonFile(SCENARIO_MANIFEST_PATH, {});

  const activeGameId = String(gameManifest?.activeGameId ?? "");
  const selectedScenarioId = String(
    scenarioManifest?.selectedScenarioId ?? scenarioManifest?.activeScenarioId ?? "",
  );

  patchSettings(userId, {
    library: {
      ...(activeGameId ? { activeGameId } : {}),
      ...(selectedScenarioId ? { selectedScenarioId } : {}),
    },
  });

  return { activeGameId, selectedScenarioId };
};

export const migrateExistingDataToFirstAccount = async (userId) => {
  if (!userId) throw new Error("userId is required");

  const scenariosTagged = tagScenarios(userId);
  const gamesTagged = tagGames(userId);
  const mapEditorDocumentsTagged = tagMapEditorDocuments(userId);
  const activeSelections = migrateActiveSelections(userId);

  return {
    activeSelections,
    gamesTagged,
    mapEditorDocumentsTagged,
    scenariosTagged,
  };
};
