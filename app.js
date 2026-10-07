"use strict";

const STORAGE_KEY = "growam-progress-v1";
const DAILY_MISSIONS = [
  { id: "refill", title: "Refill a reusable bottle", points: 5, period: "daily" },
  { id: "lights", title: "Turn off unnecessary lights", points: 5, period: "daily" },
  { id: "water", title: "Save water while brushing or washing", points: 10, period: "daily" }
];
const WEEKLY_MISSION = { id: "tree", title: "Plant or care for a real tree", points: 20, period: "weekly" };
const MISSIONS = [...DAILY_MISSIONS, WEEKLY_MISSION];
const TREE_LEVELS = [
  { name: "Speed Starter", threshold: 0 },
  { name: "Post Scout", threshold: 5 },
  { name: "Playing Keeper", threshold: 10 },
  { name: "Tree Guardian", threshold: 20 },
  { name: "Mango Hero", threshold: 40 }
];
const MISSION_IDS = new Set(MISSIONS.map((mission) => mission.id));
const PERIOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STORAGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PHOTOS_PER_MISSION = 3;
const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const PHOTO_WIDTH = 720;
const PHOTO_HEIGHT = 540;
const photoUploadsInProgress = new Set();

const elements = {
  today: document.querySelector("#today-label"),
  points: document.querySelector("#total-points"),
  levelName: document.querySelector("#level-name"),
  levelNumber: document.querySelector("#level-number"),
  levelTag: document.querySelector("#tree-level-tag"),
  treeScene: document.querySelector("#tree-scene"),
  nickname: document.querySelector("#nickname-display"),
  growthCaption: document.querySelector("#growth-caption"),
  growthPercent: document.querySelector("#growth-percent"),
  growthTrack: document.querySelector("#growth-track"),
  growthFill: document.querySelector("#growth-fill"),
  growthNext: document.querySelector("#growth-next"),
  treeDescription: document.querySelector("#tree-description"),
  rewardHeading: document.querySelector("#reward-heading"),
  rewardDescription: document.querySelector("#reward-description"),
  pointPop: document.querySelector("#point-pop"),
  heroCelebration: document.querySelector("#hero-celebration"),
  closeCelebration: document.querySelector("#close-celebration"),
  missionCount: document.querySelector("#mission-count"),
  weeklyStatus: document.querySelector("#weekly-status"),
  status: document.querySelector("#status-message"),
  download: document.querySelector("#download-card"),
  copyCaption: document.querySelector("#copy-caption"),
  profileForm: document.querySelector("#profile-form"),
  profileSave: document.querySelector(".profile-save-button"),
  reset: document.querySelector("#reset-progress"),
  editProfile: document.querySelector("#edit-profile")
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error(`${file.name} is not an image.`));
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      reject(new Error(`${file.name} is larger than 8 MB.`));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, PHOTO_WIDTH / image.naturalWidth, PHOTO_HEIGHT / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!context) {
        reject(new Error("Your browser could not prepare this picture."));
        return;
      }
      try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error(`Your browser could not compress ${file.name}.`));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error(`Your browser could not read ${file.name}.`));
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.72);
      } catch {
        reject(new Error(`Your browser could not process ${file.name}.`));
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Your browser could not open ${file.name}.`));
    };
    image.src = objectUrl;
  });
}

function renderPhotoPreviews(mission, date = new Date()) {
  const period = getPeriodKey(mission, date);
  const photos = state.photos[mission.id][period] || [];
  const preview = document.querySelector(`[data-preview="${mission.id}"]`);
  preview.replaceChildren();

  photos.forEach((src, index) => {
    const item = document.createElement("div");
    item.className = "photo-preview";
    const image = document.createElement("img");
    image.src = src;
    image.alt = `Picture ${index + 1} for ${mission.id} mission`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.textContent = "Remove picture";
    remove.setAttribute("aria-label", `Remove picture ${index + 1} from ${mission.id} mission`);
    remove.disabled = !storageAvailable;
    remove.addEventListener("click", () => removePhoto(mission.id, period, index));
    item.append(image, remove);
    preview.append(item);
  });

  const input = document.querySelector(`[data-photos="${mission.id}"]`);
  input.disabled = !isMissionCompleted(mission, date) ||
    !storageAvailable ||
    photos.length >= MAX_PHOTOS_PER_MISSION ||
    photoUploadsInProgress.has(mission.id);
  const label = document.querySelector(`label[for="${input.id}"]`);
  label.classList.toggle("is-disabled", input.disabled);
  label.setAttribute("aria-disabled", String(input.disabled));
}

async function addPhotos(missionId, fileList) {
  const mission = MISSIONS.find((item) => item.id === missionId);
  const files = [...fileList];
  if (!storageAvailable || !mission || files.length === 0 || photoUploadsInProgress.has(missionId)) {
    return;
  }

  const period = getPeriodKey(mission);
  if (!state.completedPeriods[missionId].includes(period)) {
    elements.status.textContent = "Complete the mission before adding its pictures.";
    return;
  }
  const currentPhotos = state.photos[missionId][period] || [];
  const availableSlots = MAX_PHOTOS_PER_MISSION - currentPhotos.length;
  if (files.length > availableSlots) {
    elements.status.textContent = `You can save up to ${MAX_PHOTOS_PER_MISSION} pictures for each task.`;
    return;
  }

  photoUploadsInProgress.add(missionId);
  renderPhotoPreviews(mission);
  try {
    const compressedPhotos = [];
    for (const file of files) {
      compressedPhotos.push(await resizePhoto(file));
    }
    if (!state.completedPeriods[missionId].includes(period)) {
      elements.status.textContent = "This task is no longer complete. Its pictures were not saved.";
      return;
    }
    const latestPhotos = state.photos[missionId][period] || [];
    if (latestPhotos.length + compressedPhotos.length > MAX_PHOTOS_PER_MISSION) {
      elements.status.textContent = `You can save up to ${MAX_PHOTOS_PER_MISSION} pictures for each task.`;
      return;
    }
    const photos = {
      ...state.photos,
      [missionId]: {
        ...state.photos[missionId],
        [period]: [...latestPhotos, ...compressedPhotos]
      }
    };
    const nextState = { ...state, photos };
    saveState(nextState);
    state = nextState;
    elements.status.textContent = "Pictures saved on this device.";
    render(state);
  } catch (error) {
    elements.status.textContent = `Pictures could not be saved. ${error.message}`;
  } finally {
    photoUploadsInProgress.delete(missionId);
    render(state);
  }
}

function removePhoto(missionId, period, index) {
  const photos = {
    ...state.photos,
    [missionId]: { ...state.photos[missionId] }
  };
  const remaining = [...(photos[missionId][period] || [])];
  remaining.splice(index, 1);
  if (remaining.length > 0) {
    photos[missionId][period] = remaining;
  } else {
    delete photos[missionId][period];
  }

  const nextState = { ...state, photos };
  try {
    saveState(nextState);
    state = nextState;
    elements.status.textContent = "Picture removed from this device.";
    render(state);
  } catch (error) {
    showStorageError(error);
  }
}

function localWeekKey(date = new Date()) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return localDateKey(monday);
}

function getPeriodKey(mission, date = new Date()) {
  return mission.period === "weekly" ? localWeekKey(date) : localDateKey(date);
}

function createInitialState() {
  return {
    version: 5,
    totalPoints: 0,
    completedMissions: [],
    completedPeriods: Object.fromEntries(MISSIONS.map((mission) => [mission.id, []])),
    nickname: "",
    instagramHandle: "",
    facebookProfileName: "",
    profileSaved: false,
    completedLog: [],
    photos: Object.fromEntries(MISSIONS.map((mission) => [mission.id, {}])),
    heroCelebrated: false
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSavedState(serialized) {
  const parsed = JSON.parse(serialized);
  if (!isRecord(parsed) || !Number.isSafeInteger(parsed.totalPoints) || parsed.totalPoints < 0) {
    throw new Error("Saved progress is not valid.");
  }

  if (
    parsed.version === undefined &&
    typeof parsed.day === "string" &&
    Array.isArray(parsed.completedMissions) &&
    parsed.completedMissions.every((id) => typeof id === "string")
  ) {
    return { state: createInitialStateWithPoints(parsed.totalPoints), migrated: true };
  }

  const profileFields = ["nickname", "instagramHandle", "facebookProfileName"];
  if (
    ![2, 3, 4, 5].includes(parsed.version) ||
    !Array.isArray(parsed.completedMissions) ||
    !parsed.completedMissions.every((id) => MISSION_IDS.has(id)) ||
    !isRecord(parsed.completedPeriods) ||
    (parsed.version === 5 && typeof parsed.heroCelebrated !== "boolean") ||
    !profileFields.every((field) => typeof parsed[field] === "string")
  ) {
    throw new Error("Saved progress is not valid.");
  }

  const completedPeriods = {};
  for (const mission of MISSIONS) {
    const periods = parsed.completedPeriods[mission.id];
    if (
      !Array.isArray(periods) ||
      !periods.every((period) => typeof period === "string" && PERIOD_PATTERN.test(period))
    ) {
      throw new Error("Saved mission periods are not valid.");
    }
    completedPeriods[mission.id] = [...new Set(periods)];
  }

  const completedMissionIds = new Set(parsed.completedMissions);
  if (
    Object.keys(parsed.completedPeriods).some((id) => !MISSION_IDS.has(id)) ||
    MISSIONS.some((mission) => (completedPeriods[mission.id].length > 0) !== completedMissionIds.has(mission.id)) ||
    parsed.nickname.length > 40 ||
    parsed.instagramHandle.length > 80 ||
    parsed.facebookProfileName.length > 80
  ) {
    throw new Error("Saved progress is not valid.");
  }

  const photos = Object.fromEntries(MISSIONS.map((mission) => [mission.id, {}]));
  if (parsed.version >= 3) {
    if (!isRecord(parsed.photos) || Object.keys(parsed.photos).some((id) => !MISSION_IDS.has(id))) {
      throw new Error("Saved task pictures are not valid.");
    }
    for (const mission of MISSIONS) {
      const savedPeriods = parsed.photos[mission.id];
      if (!isRecord(savedPeriods)) {
        throw new Error("Saved task pictures are not valid.");
      }
      for (const [period, images] of Object.entries(savedPeriods)) {
        if (
          !PERIOD_PATTERN.test(period) ||
          !Array.isArray(images) ||
          images.length > MAX_PHOTOS_PER_MISSION ||
          !images.every((image) => typeof image === "string" && /^data:image\/jpeg;base64,/.test(image))
        ) {
          throw new Error("Saved task pictures are not valid.");
        }
        photos[mission.id][period] = images;
      }
    }
  }

  let completedLog;
  if (parsed.version >= 4) {
    if (
      typeof parsed.profileSaved !== "boolean" ||
      !Array.isArray(parsed.completedLog) ||
      !parsed.completedLog.every((entry) =>
        isRecord(entry) &&
        MISSION_IDS.has(entry.missionId) &&
        STORAGE_DATE_PATTERN.test(entry.completedOn) &&
        PERIOD_PATTERN.test(entry.periodKey) &&
        isValidLocalDate(entry.completedOn)
      )
    ) {
      throw new Error("Saved completion history is not valid.");
    }
    const uniqueLogEntries = new Set();
    completedLog = parsed.completedLog.map((entry) => ({ ...entry }));
    for (const entry of completedLog) {
      const mission = MISSIONS.find((item) => item.id === entry.missionId);
      if (
        (mission.period === "daily" && entry.completedOn !== entry.periodKey) ||
        (mission.period === "weekly" && localWeekKey(parseLocalDate(entry.completedOn)) !== entry.periodKey) ||
        uniqueLogEntries.has(`${entry.missionId}:${entry.periodKey}`)
      ) {
        throw new Error("Saved completion history is not valid.");
      }
      uniqueLogEntries.add(`${entry.missionId}:${entry.periodKey}`);
    }
    if (
      MISSIONS.some((mission) =>
        completedPeriods[mission.id].some((period) =>
          !uniqueLogEntries.has(`${mission.id}:${period}`)
        )
      ) ||
      completedLog.some((entry) => !completedPeriods[entry.missionId].includes(entry.periodKey))
    ) {
      throw new Error("Saved completion history does not match mission progress.");
    }
  } else {
    completedLog = MISSIONS.flatMap((mission) =>
      completedPeriods[mission.id].map((periodKey) => ({
        missionId: mission.id,
        completedOn: periodKey,
        periodKey
      }))
    );
  }

  if (
    parsed.version >= 4 &&
    completedLog.reduce((total, entry) => {
      const mission = MISSIONS.find((item) => item.id === entry.missionId);
      return total + mission.points;
    }, 0) !== parsed.totalPoints
  ) {
    throw new Error("Saved points do not match the completed mission history.");
  }

  return {
    state: {
      version: 5,
      totalPoints: parsed.totalPoints,
      completedMissions: [...new Set(parsed.completedMissions)],
      completedPeriods,
      nickname: parsed.nickname,
      instagramHandle: parsed.instagramHandle,
      facebookProfileName: parsed.facebookProfileName,
      profileSaved: parsed.version >= 4
        ? parsed.profileSaved
        : profileFields.some((field) => parsed[field].length > 0),
      completedLog,
      photos,
      heroCelebrated: parsed.version >= 5 ? parsed.heroCelebrated === true : false
    },
    migrated: parsed.version !== 5
  };
}

function parseLocalDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (localDateKey(date) !== dateKey) {
    throw new Error("Saved completion history contains an invalid date.");
  }
  return date;
}

function isValidLocalDate(dateKey) {
  try {
    parseLocalDate(dateKey);
    return true;
  } catch {
    return false;
  }
}

function createInitialStateWithPoints(totalPoints) {
  return { ...createInitialState(), totalPoints };
}

function saveState(nextState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function getTreeLevel(points) {
  let levelIndex = 0;
  for (let index = 1; index < TREE_LEVELS.length; index += 1) {
    if (points >= TREE_LEVELS[index].threshold) {
      levelIndex = index;
    } else {
      break;
    }
  }
  return levelIndex;
}

function isMissionCompleted(mission, date = new Date()) {
  return state.completedPeriods[mission.id].includes(getPeriodKey(mission, date));
}

function render(state, syncProfile = false) {
  const levelIndex = getTreeLevel(state.totalPoints);
  const level = TREE_LEVELS[levelIndex];
  const nextLevel = TREE_LEVELS[levelIndex + 1];
  const today = new Date();

  elements.today.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(today);
  document.querySelector("#time-label").textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(today);
  elements.nickname.textContent = state.nickname || "Grower";
  elements.points.textContent = String(state.totalPoints);
  elements.levelName.textContent = level.name;
  elements.levelNumber.textContent = String(levelIndex + 1);
  elements.levelTag.textContent = `LEVEL ${levelIndex + 1}`;
  elements.treeScene.dataset.stage = String(levelIndex);
  elements.treeScene.setAttribute("aria-label", `Mango tree at ${level.name} stage`);
  elements.growthCaption.textContent = level.name;

  let progress = 100;
  if (nextLevel) {
    const levelSpan = nextLevel.threshold - level.threshold;
    const pointsRemaining = nextLevel.threshold - state.totalPoints;
    progress = Math.floor(((state.totalPoints - level.threshold) / levelSpan) * 100);
    elements.growthNext.textContent = `${pointsRemaining} ${pointsRemaining === 1 ? "point" : "points"} to ${nextLevel.name}`;
  } else {
    elements.growthNext.textContent = "Your mango tree has grown. Keep your eco habits alive.";
  }
  elements.treeDescription.textContent = nextLevel
    ? "A little care today makes room for new growth tomorrow."
    : "Your mango tree has grown. Keep your eco habits alive.";
  elements.rewardHeading.textContent = nextLevel
    ? "Your progress card, growing toward Mango Hero."
    : "Mango Hero! Congratulations on growing your tree.";
  elements.rewardDescription.textContent = nextLevel
    ? "Download a square snapshot of your Growam tree and current progress."
    : "Celebrate your Growam journey with a square card for sharing.";

  elements.growthPercent.textContent = `${progress}%`;
  elements.growthTrack.setAttribute("aria-valuenow", String(progress));
  elements.growthFill.style.width = `${progress}%`;
  elements.growthTrack.setAttribute(
    "aria-label",
    nextLevel ? `Progress from ${level.name} to ${nextLevel.name}` : "Mango Hero stage reached"
  );
  elements.levelName.setAttribute("aria-label", `${level.name}, level ${levelIndex + 1}`);

  const completedDailyCount = DAILY_MISSIONS.filter((mission) => isMissionCompleted(mission, today)).length;
  const weeklyDone = isMissionCompleted(WEEKLY_MISSION, today);
  elements.missionCount.textContent = `${completedDailyCount} of 3 daily done`;
  elements.weeklyStatus.textContent = weeklyDone
    ? "Weekly bonus completed. It will be available again next Monday."
    : "Weekly bonus is available once each Monday-to-Sunday week.";

  document.querySelectorAll("[data-claim]").forEach((button) => {
    const mission = MISSIONS.find((item) => item.id === button.dataset.claim);
    const isComplete = isMissionCompleted(mission, today);
    const card = button.closest(".mission-card");
    button.disabled = isComplete || !storageAvailable;
    button.setAttribute("aria-pressed", String(isComplete));
    button.textContent = isComplete
      ? mission.period === "weekly" ? "Done This Week" : "Done Today"
      : "Do";
    button.setAttribute(
      "aria-label",
      isComplete
        ? `${mission.title}, done ${mission.period === "weekly" ? "this week" : "today"}`
        : `Do: ${mission.title}, earn ${mission.points} points`
    );
    card.classList.toggle("is-complete", isComplete);
    card.setAttribute("aria-label", `${mission.title}, ${isComplete ? "completed" : "available"}, ${mission.points} points`);
    const undoButton = card.querySelector("[data-undo]");
    undoButton.disabled = !isComplete || !storageAvailable;
    undoButton.setAttribute("aria-label", `Undo: ${mission.title}, remove ${mission.points} points`);
    const evidence = card.querySelector(".mission-evidence");
    evidence.hidden = !isComplete;
    const photoInput = card.querySelector("[data-photos]");
    photoInput.disabled = !isComplete || !storageAvailable;
    renderPhotoPreviews(mission, today);
  });

  if (syncProfile) {
    elements.profileForm.elements.nickname.value = state.nickname;
    elements.profileForm.elements.instagramHandle.value = state.instagramHandle;
    elements.profileForm.elements.facebookProfileName.value = state.facebookProfileName;
  }

  const profileIsLocked = state.profileSaved && !profileEditing;
  ["nickname", "instagramHandle", "facebookProfileName"].forEach((field) => {
    elements.profileForm.elements[field].readOnly = profileIsLocked;
  });
  elements.profileSave.disabled = profileIsLocked || !storageAvailable;
  elements.profileSave.textContent = profileIsLocked ? "Saved" : "Save Profile";
  elements.profileSave.classList.toggle("is-saved", profileIsLocked);
  elements.editProfile.setAttribute("aria-label", profileEditing ? "Cancel profile editing" : "Edit profile");
  elements.editProfile.title = profileEditing ? "Cancel profile editing" : "Edit profile";
}

function showPointReward(points) {
  window.clearTimeout(pointRewardTimer);
  elements.pointPop.textContent = `+${points}`;
  elements.pointPop.classList.remove("is-visible");
  void elements.pointPop.offsetWidth;
  elements.pointPop.classList.add("is-visible");
  elements.treeScene.classList.remove("is-growing");
  void elements.treeScene.offsetWidth;
  elements.treeScene.classList.add("is-growing");
  pointRewardTimer = window.setTimeout(() => {
    elements.pointPop.classList.remove("is-visible");
    elements.treeScene.classList.remove("is-growing");
  }, 1800);
}

function celebrateMangoHero() {
  elements.heroCelebration.hidden = false;
  elements.treeScene.classList.add("is-hero-celebration");
  elements.status.textContent = "Congratulations! You reached Mango Hero. Keep your small eco habits alive.";
}

function showStorageError(error) {
  storageAvailable = false;
  elements.status.textContent = `Progress could not be saved on this device. Mission, photo, and profile changes are paused. ${error.message}`;
  document.querySelectorAll("[data-claim], [data-undo], [data-photos], #profile-form button, .photo-remove").forEach((button) => {
    button.disabled = true;
  });
  document.querySelectorAll(".upload-label").forEach((label) => {
    label.classList.add("is-disabled");
    label.setAttribute("aria-disabled", "true");
  });
}

function claimMission(missionId) {
  const mission = MISSIONS.find((item) => item.id === missionId);
  if (!storageAvailable || !mission || isMissionCompleted(mission)) {
    return;
  }

  const period = getPeriodKey(mission);
  const previousLevel = TREE_LEVELS[getTreeLevel(state.totalPoints)].name;
  const nextTotal = state.totalPoints + mission.points;
  const nextLevel = TREE_LEVELS[getTreeLevel(nextTotal)].name;
  const grewToNewLevel = nextLevel !== previousLevel;
  const reachedHero = state.totalPoints < 40 && nextTotal >= 40 && !state.heroCelebrated;
  const nextState = {
    ...state,
    totalPoints: nextTotal,
    completedMissions: state.completedMissions.includes(missionId)
      ? state.completedMissions
      : [...state.completedMissions, missionId],
    completedPeriods: {
      ...state.completedPeriods,
      [missionId]: [...new Set([...state.completedPeriods[missionId], period])]
    },
    completedLog: [...state.completedLog, {
      missionId,
      completedOn: localDateKey(),
      periodKey: period
    }],
    heroCelebrated: state.heroCelebrated || reachedHero
  };

  try {
    saveState(nextState);
    state = nextState;
    elements.status.textContent = grewToNewLevel
      ? `${mission.title} done. +${mission.points} points. Your tree is now ${nextLevel}.`
      : `${mission.title} done. +${mission.points} points. ${nextTotal} total.`;
    render(state);
    showPointReward(mission.points);
    if (reachedHero) {
      celebrateMangoHero();
    }
  } catch (error) {
    showStorageError(error);
  }
}

function undoMission(missionId) {
  const mission = MISSIONS.find((item) => item.id === missionId);
  if (!storageAvailable || !mission || !isMissionCompleted(mission)) {
    return;
  }

  const period = getPeriodKey(mission);
  const completedPeriods = {
    ...state.completedPeriods,
    [missionId]: state.completedPeriods[missionId].filter((savedPeriod) => savedPeriod !== period)
  };
  const photos = {
    ...state.photos,
    [missionId]: { ...state.photos[missionId] }
  };
  delete photos[missionId][period];

  const nextState = {
    ...state,
    totalPoints: Math.max(0, state.totalPoints - mission.points),
    completedMissions: state.completedMissions.filter(
      (id) => id !== missionId || completedPeriods[missionId].length > 0
    ),
    completedPeriods,
    completedLog: state.completedLog.filter(
      (entry) => entry.missionId !== missionId || entry.periodKey !== period
    ),
    photos
  };

  try {
    saveState(nextState);
    state = nextState;
    const level = TREE_LEVELS[getTreeLevel(state.totalPoints)].name;
    elements.status.textContent = `${mission.title} undone. ${mission.points} points removed. Your tree is now ${level}; attached pictures were removed too.`;
    render(state);
  } catch (error) {
    showStorageError(error);
  }
}

function saveProfile(event) {
  event.preventDefault();
  if (!storageAvailable) {
    return;
  }

  const form = elements.profileForm.elements;
  const profileValues = {
    nickname: form.nickname.value.trim(),
    instagramHandle: form.instagramHandle.value.trim(),
    facebookProfileName: form.facebookProfileName.value.trim()
  };
  if (profileValues.nickname.length > 40 || profileValues.instagramHandle.length > 80 || profileValues.facebookProfileName.length > 80) {
    elements.status.textContent = "Nickname must be 40 characters or fewer. Instagram and Facebook fields must be 80 characters or fewer.";
    return;
  }
  const nextState = {
    ...state,
    ...profileValues,
    profileSaved: true
  };

  try {
    saveState(nextState);
    state = nextState;
    profileEditing = false;
    elements.status.textContent = "Saved";
    elements.profileSave.textContent = "Saved";
    elements.profileSave.classList.add("is-saved");
    render(state, true);
  } catch (error) {
    showStorageError(error);
  }
}

function toggleProfileEditing() {
  if (!storageAvailable) {
    return;
  }
  if (profileEditing) {
    profileEditing = false;
    render(state, true);
    elements.status.textContent = "Profile editing cancelled.";
    return;
  }
  profileEditing = true;
  render(state);
  elements.profileForm.elements.nickname.focus();
  elements.status.textContent = "Profile unlocked. Edit your details and save them.";
}

function resetProgress() {
  if (!window.confirm("Reset all Growam progress and profile details on this device? This cannot be undone.")) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    state = createInitialState();
    profileEditing = false;
    window.clearTimeout(pointRewardTimer);
    elements.pointPop.classList.remove("is-visible");
    elements.heroCelebration.hidden = true;
    elements.treeScene.classList.remove("is-hero-celebration", "is-growing");
    saveState(state);
    storageAvailable = true;
    render(state, true);
    elements.status.textContent = "Progress and profile details have been reset.";
  } catch (error) {
    showStorageError(error);
  }
}

function loadTreeIllustration() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const svg = document.querySelector(".mango-tree").cloneNode(true);
    const stageClass = ["stage-seed", "stage-sprout", "stage-sapling", "stage-guardian", "stage-hero"][getTreeLevel(state.totalPoints)];
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "360");
    svg.setAttribute("height", "340");
    svg.querySelectorAll(".tree-stage").forEach((stage) => {
      stage.style.display = stage.classList.contains(stageClass) ? "block" : "none";
      stage.style.opacity = "1";
      stage.style.transform = "none";
    });
    svg.querySelectorAll(".leaf-sway").forEach((leaves) => {
      leaves.style.animation = "none";
      leaves.style.transform = "none";
    });
    const objectUrl = URL.createObjectURL(new Blob(
      [new XMLSerializer().serializeToString(svg)],
      { type: "image/svg+xml;charset=utf-8" }
    ));
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The tree illustration could not be prepared for the progress card."));
    };
    image.src = objectUrl;
  });
}

async function downloadProgressCard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");

  if (!context) {
    elements.status.textContent = "Your browser could not create the progress card.";
    return;
  }

  try {
    const treeImage = await loadTreeIllustration();
    context.fillStyle = "#f8f5e9";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#173c2e";
    context.beginPath();
    context.roundRect(34, 34, 1012, 1012, 38);
    context.fill();
    context.fillStyle = "#f2a33a";
    context.beginPath();
    context.arc(875, 178, 88, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#f2a33a";
    context.font = "700 48px Arial, sans-serif";
    context.fillText("GROWAM", 92, 119);
    context.fillStyle = "#d4dfd3";
    context.font = "400 23px Arial, sans-serif";
    context.fillText("SMALL ACTIONS. A GROWING IMPACT.", 94, 158);

    context.save();
    context.beginPath();
    context.roundRect(333, 183, 414, 414, 28);
    context.clip();
    context.drawImage(treeImage, 333, 183, 414, 414);
    context.restore();

    const level = TREE_LEVELS[getTreeLevel(state.totalPoints)];
    context.textAlign = "center";
    context.fillStyle = "#f6c76f";
    context.font = "700 21px Arial, sans-serif";
    context.fillText(`LEVEL ${getTreeLevel(state.totalPoints) + 1}`, 540, 622);
    context.fillStyle = "#fffdf7";
    context.font = "600 52px Georgia, serif";
    context.fillText(level.name, 540, 690, 850);
    context.font = "700 42px Arial, sans-serif";
    context.fillStyle = "#f2a33a";
    context.fillText(`${state.totalPoints} POINTS`, 540, 753);

    context.textAlign = "left";
    context.fillStyle = "#d4dfd3";
    context.font = "400 21px Arial, sans-serif";
    let socialY = 840;
    if (state.nickname) {
      context.fillStyle = "#fffdf7";
      context.font = "600 26px Arial, sans-serif";
      context.fillText(state.nickname, 92, socialY, 896);
      socialY += 43;
    }
    for (const [label, value] of [
      ["Instagram", state.instagramHandle],
      ["Facebook", state.facebookProfileName]
    ]) {
      if (value) {
        context.fillStyle = "#f6c76f";
        context.font = "700 18px Arial, sans-serif";
        context.fillText(`${label}:`, 92, socialY);
        context.fillStyle = "#e4e9df";
        context.font = "400 21px Arial, sans-serif";
        context.fillText(value, 205, socialY, 780);
        socialY += 38;
      }
    }
    context.textAlign = "center";
    context.fillStyle = "#aebdad";
    context.font = "400 16px Arial, sans-serif";
    context.fillText("Self-reported progress · saved on this device", 540, 987);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The progress card PNG could not be prepared.")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `growam-progress-${localDateKey()}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.status.textContent = "Your square Growam progress card is ready to save.";
  } catch (error) {
    elements.status.textContent = `The progress card could not be downloaded. ${error.message}`;
  }
}

async function copyCaption() {
  const level = TREE_LEVELS[getTreeLevel(state.totalPoints)].name;
  const caption = `I reached ${level} in Growam by tracking small eco habits. My progress is self-reported.`;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(caption);
    } else {
      const temporaryInput = document.createElement("textarea");
      temporaryInput.value = caption;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.append(temporaryInput);
      temporaryInput.select();
      const copied = document.execCommand("copy");
      temporaryInput.remove();
      if (!copied) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
    }
    elements.status.textContent = "Caption copied. Your progress is self-reported.";
  } catch (error) {
    elements.status.textContent = `The caption could not be copied. ${error.message}`;
  }
}

function refreshAtLocalMidnight() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
  window.setTimeout(() => {
    render(state);
    refreshAtLocalMidnight();
  }, delay);
}

let state = createInitialState();
let storageAvailable = true;
let profileEditing = false;
let pointRewardTimer;

try {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === null) {
    saveState(state);
  } else {
    try {
      const loaded = readSavedState(saved);
      state = loaded.state;
      if (loaded.migrated) {
        saveState(state);
      }
    } catch (error) {
      state = createInitialState();
      saveState(state);
      elements.status.textContent = "Saved data was invalid, so Growam started safely with zero points.";
    }
  }
  render(state, true);
} catch (error) {
  render(state, true);
  showStorageError(error);
}

document.querySelectorAll("[data-claim]").forEach((button) => {
  button.addEventListener("click", () => claimMission(button.dataset.claim));
});
document.querySelectorAll("[data-undo]").forEach((button) => {
  button.addEventListener("click", () => undoMission(button.dataset.undo));
});
document.querySelectorAll("[data-photos]").forEach((input) => {
  input.addEventListener("change", () => {
    addPhotos(input.dataset.photos, input.files).finally(() => {
      input.value = "";
    });
  });
});
elements.closeCelebration.addEventListener("click", () => {
  elements.heroCelebration.hidden = true;
  elements.treeScene.classList.remove("is-hero-celebration");
});
elements.profileForm.addEventListener("submit", saveProfile);
elements.editProfile.addEventListener("click", toggleProfileEditing);
elements.profileForm.addEventListener("input", () => {
  elements.profileSave.textContent = "Save Profile";
  elements.profileSave.classList.remove("is-saved");
});
elements.reset.addEventListener("click", resetProgress);
elements.download.addEventListener("click", downloadProgressCard);
elements.copyCaption.addEventListener("click", copyCaption);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    render(state);
  }
});
window.setInterval(() => {
  document.querySelector("#time-label").textContent = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}, 15000);
refreshAtLocalMidnight();
