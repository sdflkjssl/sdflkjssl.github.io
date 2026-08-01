const navigation = document.querySelector("#diagram-navigation");
const search = document.querySelector("#module-search");
const diagram = document.querySelector("#diagram");
const diagramStage = document.querySelector("#diagram-stage");
const diagramTitle = document.querySelector("#diagram-title");
const diagramGroup = document.querySelector("#diagram-group");
const loadingIndicator = document.querySelector("#loading-indicator");
const viewMode = document.querySelector("#view-mode");
const openSvg = document.querySelector("#open-svg");
const menuButton = document.querySelector("#menu-button");
const sidebarScrim = document.querySelector("#sidebar-scrim");
const sidebar = document.querySelector("#sidebar");
const workspace = document.querySelector(".workspace");
const descriptionTitle = document.querySelector("#diagram-description-title");
const diagramOutline = document.querySelector("#diagram-outline");
const mobileNavigation = window.matchMedia("(max-width: 900px)");

let diagrams = [];
let currentDiagram = null;
let menuHeldFocus = false;

function synchroniseNavigationState() {
  const navigationOpen = mobileNavigation.matches && document.body.classList.contains("navigation-open");
  const navigationHidden = mobileNavigation.matches && !navigationOpen;
  sidebar.toggleAttribute("inert", navigationHidden);
  workspace.toggleAttribute("inert", navigationOpen);
  sidebarScrim.toggleAttribute("inert", !navigationOpen);

  if (navigationHidden) {
    sidebar.setAttribute("aria-hidden", "true");
  } else {
    sidebar.removeAttribute("aria-hidden");
  }
  if (navigationOpen) {
    workspace.setAttribute("aria-hidden", "true");
    sidebarScrim.removeAttribute("aria-hidden");
  } else {
    workspace.removeAttribute("aria-hidden");
    sidebarScrim.setAttribute("aria-hidden", "true");
  }
}

function closeNavigation({ restoreFocus = false } = {}) {
  const focusWasInside = sidebar.contains(document.activeElement);
  document.body.classList.remove("navigation-open");
  menuButton.setAttribute("aria-expanded", "false");
  synchroniseNavigationState();
  if (restoreFocus && focusWasInside && mobileNavigation.matches) {
    menuButton.focus();
  }
}

function openNavigation({ focusSearch = false } = {}) {
  document.body.classList.add("navigation-open");
  menuButton.setAttribute("aria-expanded", "true");
  synchroniseNavigationState();
  if (focusSearch) {
    search.focus();
  }
}

function renderNavigation(items) {
  navigation.replaceChildren();
  const groups = new Map();

  for (const item of items) {
    if (!groups.has(item.group)) {
      groups.set(item.group, []);
    }
    groups.get(item.group).push(item);
  }

  for (const [groupName, groupItems] of groups) {
    const section = document.createElement("section");
    section.className = "navigation-group";
    section.dataset.group = groupName;

    const heading = document.createElement("h2");
    heading.textContent = groupName;

    const list = document.createElement("ul");
    list.className = "navigation-list";

    for (const item of groupItems) {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.className = "navigation-button";
      button.type = "button";
      button.dataset.diagramId = item.id;
      button.textContent = item.title;
      button.addEventListener("click", () => {
        if (window.location.hash.slice(1) === item.id) {
          selectDiagram(item);
        } else {
          window.location.hash = item.id;
        }
      });
      listItem.append(button);
      list.append(listItem);
    }

    section.append(heading, list);
    navigation.append(section);
  }
}

function selectDiagram(item) {
  if (!item) {
    return;
  }
  if (currentDiagram?.id === item.id) {
    closeNavigation({ restoreFocus: true });
    return;
  }

  currentDiagram = item;
  diagram.classList.add("is-loading");
  loadingIndicator.hidden = false;
  loadingIndicator.textContent = "Loading diagram…";
  diagram.src = item.src;
  diagram.alt = `${item.title} process diagram`;
  diagramTitle.textContent = item.title;
  diagramGroup.textContent = item.group;
  descriptionTitle.textContent = `${item.title} text outline`;
  diagramOutline.replaceChildren();
  for (const line of item.outline) {
    const listItem = document.createElement("li");
    listItem.textContent = line;
    diagramOutline.append(listItem);
  }
  openSvg.href = item.src;
  document.title = `${item.title} · Process Map`;

  for (const button of navigation.querySelectorAll(".navigation-button")) {
    const selected = button.dataset.diagramId === item.id;
    if (selected) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
    if (selected) {
      button.scrollIntoView({ block: "nearest" });
    }
  }

  diagramStage.scrollTo({ top: 0, left: 0 });
  closeNavigation({ restoreFocus: true });
}

function selectFromHash() {
  const requestedId = window.location.hash.slice(1);
  const item = diagrams.find((candidate) => candidate.id === requestedId) ?? diagrams[0];
  if (!item) {
    return;
  }
  selectDiagram(item);
}

function filterNavigation() {
  const query = search.value.trim().toLocaleLowerCase();
  let visibleCount = 0;

  for (const section of navigation.querySelectorAll(".navigation-group")) {
    let groupHasMatch = false;
    for (const button of section.querySelectorAll(".navigation-button")) {
      const matches = button.textContent.toLocaleLowerCase().includes(query);
      button.closest("li").hidden = !matches;
      groupHasMatch ||= matches;
      visibleCount += Number(matches);
    }
    section.hidden = !groupHasMatch;
  }

  navigation.querySelector(".navigation-empty")?.remove();
  if (!visibleCount) {
    const empty = document.createElement("p");
    empty.className = "navigation-empty";
    empty.textContent = "No modules match this search.";
    navigation.append(empty);
  }
}

function visibleNavigationButtons() {
  return [...navigation.querySelectorAll(".navigation-button")].filter((button) => !button.closest("li").hidden);
}

function moveNavigationFocus(direction) {
  const buttons = visibleNavigationButtons();
  if (!buttons.length) {
    return;
  }
  const focusedIndex = buttons.indexOf(document.activeElement);
  let nextIndex;
  if (focusedIndex >= 0) {
    nextIndex = (focusedIndex + direction + buttons.length) % buttons.length;
  } else {
    nextIndex = direction > 0 ? 0 : buttons.length - 1;
  }
  buttons[nextIndex].focus();
}

function trapNavigationFocus(event) {
  if (event.key !== "Tab" || !mobileNavigation.matches || !document.body.classList.contains("navigation-open")) {
    return;
  }
  const focusable = [search, ...visibleNavigationButtons()];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

diagram.addEventListener("load", () => {
  diagram.classList.remove("is-loading");
  loadingIndicator.hidden = true;
});

diagram.addEventListener("error", () => {
  diagram.classList.add("is-loading");
  loadingIndicator.hidden = false;
  loadingIndicator.textContent = "This diagram could not be loaded.";
});

search.addEventListener("input", filterNavigation);
search.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveNavigationFocus(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveNavigationFocus(-1);
  }
});

navigation.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveNavigationFocus(1);
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveNavigationFocus(-1);
  }
  trapNavigationFocus(event);
});

search.addEventListener("keydown", trapNavigationFocus);

viewMode.addEventListener("click", () => {
  const fit = diagramStage.dataset.mode !== "fit";
  diagramStage.dataset.mode = fit ? "fit" : "actual";
  viewMode.setAttribute("aria-pressed", String(fit));
  localStorage.setItem("process-map-view", diagramStage.dataset.mode);
});

menuButton.addEventListener("click", () => {
  if (document.body.classList.contains("navigation-open")) {
    closeNavigation({ restoreFocus: true });
  } else {
    openNavigation({ focusSearch: true });
  }
});

sidebarScrim.addEventListener("click", () => closeNavigation({ restoreFocus: true }));
menuButton.addEventListener("focus", () => {
  menuHeldFocus = true;
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    openNavigation({ focusSearch: true });
  }
  if (event.key === "Escape") {
    closeNavigation({ restoreFocus: true });
  }
});

document.addEventListener("focusin", (event) => {
  if (event.target !== menuButton && event.target !== document.body && event.target !== document.documentElement) {
    menuHeldFocus = false;
  }
});

document.addEventListener("pointerdown", (event) => {
  if (event.target !== menuButton) {
    menuHeldFocus = false;
  }
});

window.addEventListener("hashchange", selectFromHash);
mobileNavigation.addEventListener("change", () => {
  if (mobileNavigation.matches) {
    closeNavigation({ restoreFocus: true });
  } else {
    document.body.classList.remove("navigation-open");
    menuButton.setAttribute("aria-expanded", "false");
    synchroniseNavigationState();
    if (menuHeldFocus) {
      const selectedButton = navigation.querySelector('[aria-current="page"]');
      (selectedButton ?? search).focus();
      menuHeldFocus = false;
    }
  }
});

async function initialise() {
  try {
    const response = await fetch("manifest.json");
    if (!response.ok) {
      throw new Error(`Manifest request failed with ${response.status}`);
    }
    diagrams = await response.json();
    renderNavigation(diagrams);

    const savedMode = localStorage.getItem("process-map-view");
    if (savedMode === "actual") {
      diagramStage.dataset.mode = "actual";
      viewMode.setAttribute("aria-pressed", "false");
    }
    selectFromHash();
  } catch (error) {
    navigation.innerHTML = '<p class="navigation-status">The process map index could not be loaded.</p>';
    loadingIndicator.textContent = "The process maps are temporarily unavailable.";
    console.error(error);
  }
}

synchroniseNavigationState();
initialise();
