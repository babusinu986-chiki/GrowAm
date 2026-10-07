"use strict";

const STORAGE_KEY = "growam-progress-v1";
const MISSIONS = {
  refill: { title: "Refill a reusable bottle", points: 5 },
  lights: { title: "Turn off unnecessary lights", points: 5 },
  water: { title: "Save water while brushing or washing", points: 10 },
  tree: { title: "Plant or care for a real tree", points: 20 }
};
const TREE_LEVELS = [
  { name: "Speed Starter", threshold: 0 },
  { name: "Post Scout", threshold: 5 },
  { name: "Playing Keeper", threshold: 10 },
  { name: "Tree Guardian", threshold: 20 },
  { name: "Mango Hero", threshold: 40 }
];

const details = document.querySelector("#profile-details");
const completedCount = document.querySelector("#completed-count");
const historyList = document.querySelector("#history-list");
const message = document.querySelector("#records-message");

function makeProfileRecord(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "profile-record";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "Not provided";
  wrapper.append(term, description);
  return wrapper;
}

function formatLocalDate(dateKey, options) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function showStorageError(text) {
  message.hidden = false;
  message.textContent = text;
}

function renderHistory(entries, photosByMission) {
  historyList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "No completed tasks are recorded yet. Completed tasks will appear here by local date, including Saturdays and Sundays.";
    historyList.append(empty);
    return;
  }

  const grouped = new Map();
  entries.forEach((entry) => {
    if (!grouped.has(entry.completedOn)) {
      grouped.set(entry.completedOn, []);
    }
    grouped.get(entry.completedOn).push(entry);
  });

  [...grouped.entries()]
    .sort(([first], [second]) => second.localeCompare(first))
    .forEach(([dateKey, dayEntries]) => {
      const section = document.createElement("article");
      section.className = "history-day";
      const header = document.createElement("div");
      header.className = "history-day-heading";
      const heading = document.createElement("h3");
      heading.textContent = formatLocalDate(dateKey, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const weekday = formatLocalDate(dateKey, { weekday: "long" });
      const meta = document.createElement("span");
      meta.textContent = `${dayEntries.length} ${dayEntries.length === 1 ? "task" : "tasks"} · ${weekday}`;
      header.append(heading, meta);

      const list = document.createElement("ul");
      list.className = "history-task-list";
      dayEntries.forEach((entry) => {
        const mission = MISSIONS[entry.missionId];
        if (!mission) {
          return;
        }
        const item = document.createElement("li");
        item.className = "history-task";
        const name = document.createElement("span");
        name.textContent = mission.title;
        const points = document.createElement("span");
        points.className = "history-task-points";
        points.textContent = `+${mission.points} pts`;
        item.append(name, points);
        list.append(item);
        const photos = photosByMission[entry.missionId]?.[entry.periodKey] || [];
        if (photos.length) {
          const photoList = document.createElement("div");
          photoList.className = "history-photos";
          photos.forEach((source, index) => {
            const image = document.createElement("img");
            image.src = source;
            image.alt = `Picture ${index + 1} for ${mission.title}`;
            photoList.append(image);
          });
          const photoItem = document.createElement("li");
          photoItem.className = "history-task-photos";
          photoItem.append(photoList);
          list.append(photoItem);
        }
      });

      section.append(header, list);
      historyList.append(section);
    });
}

try {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const state = raw ? JSON.parse(raw) : null;
  if (
    !state ||
    typeof state !== "object" ||
    !Number.isSafeInteger(state.totalPoints) ||
    state.totalPoints < 0 ||
    typeof state.nickname !== "string" ||
    typeof state.instagramHandle !== "string" ||
    typeof state.facebookProfileName !== "string" ||
    !Array.isArray(state.completedLog)
  ) {
    throw new Error("No valid Growam profile or task history was found in this browser.");
  }

  details.replaceChildren(
    makeProfileRecord("Username", state.nickname),
    makeProfileRecord("Instagram", state.instagramHandle),
    makeProfileRecord("Facebook", state.facebookProfileName),
    makeProfileRecord("Total points", String(state.totalPoints)),
    makeProfileRecord("Tree level", TREE_LEVELS.reduce(
      (current, level) => state.totalPoints >= level.threshold ? level.name : current,
      TREE_LEVELS[0].name
    ))
  );
  completedCount.textContent = String(state.completedLog.length);
  document.querySelector("#total-points").textContent = String(state.totalPoints);
  renderHistory(state.completedLog, state.photos || {});
} catch (error) {
  details.replaceChildren(
    makeProfileRecord("Username", ""),
    makeProfileRecord("Instagram", ""),
    makeProfileRecord("Facebook", ""),
    makeProfileRecord("Total points", "0"),
    makeProfileRecord("Tree level", "Speed Starter")
  );
  completedCount.textContent = "0";
  document.querySelector("#total-points").textContent = "0";
  renderHistory([], {});
  showStorageError(`${error.message} Save a profile and complete a task in Growam to see them here.`);
}
