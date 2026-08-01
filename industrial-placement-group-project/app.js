const navigation = document.querySelector("#diagram-navigation");
const search = document.querySelector("#module-search");
const diagramContainer = document.querySelector("#diagram-container");
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
const coarsePointer = window.matchMedia("(any-pointer: coarse)");

let diagrams = [];
let currentDiagram = null;
let menuHeldFocus = false;
let diagramRenderVersion = 0;
let focusHeadingAfterRender = false;
let preferredViewMode = null;

function setViewMode(mode) {
  diagramStage.dataset.mode = mode;
  viewMode.setAttribute("aria-pressed", String(mode === "fit"));
}

function applyViewMode(item) {
  const automaticMode = item.id === "overview" && coarsePointer.matches ? "actual" : "fit";
  setViewMode(preferredViewMode ?? automaticMode);
}

function normaliseDiagramLabel(value) {
  return value.replace(/\s+/g, " ").trim();
}

function connectOverviewModules(svg) {
  const moduleItems = diagrams.filter((item) => item.group !== "Overview");
  const textNodes = [...svg.querySelectorAll("text")];
  const claimedTextNodes = new Set();

  for (const item of moduleItems) {
    const textNode = textNodes.find((candidate) => (
      !claimedTextNodes.has(candidate)
      && normaliseDiagramLabel(candidate.textContent) === item.title
    ));
    const shape = textNode?.previousElementSibling;

    if (!textNode || shape?.localName !== "rect") {
      throw new Error(`Overview node could not be linked: ${item.title}`);
    }

    const link = document.createElementNS(svg.namespaceURI, "a");
    link.classList.add("module-link");
    link.setAttribute("href", `#${item.id}`);
    link.setAttribute("aria-label", `Open ${item.title} process diagram`);
    link.setAttribute("tabindex", "0");
    link.dataset.diagramId = item.id;
    link.addEventListener("click", () => {
      focusHeadingAfterRender = true;
    });
    shape.parentNode.insertBefore(link, shape);
    link.append(shape, textNode);
    claimedTextNodes.add(textNode);
  }

  if (claimedTextNodes.size !== moduleItems.length) {
    throw new Error("Not every overview module received a link");
  }
}

async function createOverviewDiagram(item) {
  const response = await fetch(item.src);
  if (!response.ok) {
    throw new Error(`Diagram request failed with ${response.status}`);
  }

  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
    throw new Error("Overview diagram is not valid SVG");
  }

  const svg = document.importNode(parsed.documentElement, true);
  svg.querySelectorAll("script, foreignObject").forEach((element) => element.remove());
  svg.removeAttribute("style");
  svg.classList.add("diagram");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Complete process map. Select any module to open its detailed process diagram.");
  svg.setAttribute("aria-details", "diagram-description");
  connectOverviewModules(svg);
  return svg;
}

function createDetailDiagram(item) {
  const image = document.createElement("img");
  image.className = "diagram";
  image.src = item.src;
  image.alt = `${item.title} process diagram`;
  image.setAttribute("aria-details", "diagram-description");
  return image;
}

async function renderDiagram(item) {
  const renderVersion = ++diagramRenderVersion;
  diagramContainer.classList.add("is-loading");
  loadingIndicator.hidden = false;
  loadingIndicator.textContent = "Loading diagram…";

  try {
    const element = item.id === "overview"
      ? await createOverviewDiagram(item)
      : createDetailDiagram(item);

    if (element instanceof HTMLImageElement) {
      if (element.complete && !element.naturalWidth) {
        throw new Error("Diagram image could not be loaded");
      }
      if (!element.complete) {
        await new Promise((resolve, reject) => {
          element.addEventListener("load", resolve, { once: true });
          element.addEventListener("error", reject, { once: true });
        });
      }
    }

    if (renderVersion !== diagramRenderVersion) {
      return;
    }

    diagramContainer.replaceChildren(element);
    diagramContainer.classList.remove("is-loading");
    loadingIndicator.hidden = true;
    if (focusHeadingAfterRender) {
      diagramTitle.focus();
      focusHeadingAfterRender = false;
    }
  } catch (error) {
    if (renderVersion !== diagramRenderVersion) {
      return;
    }
    diagramContainer.classList.add("is-loading");
    loadingIndicator.hidden = false;
    loadingIndicator.textContent = "This diagram could not be loaded.";
    currentDiagram = null;
    focusHeadingAfterRender = false;
    console.error(error);
  }
}

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
  applyViewMode(item);
  void renderDiagram(item);
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
  preferredViewMode = fit ? "fit" : "actual";
  setViewMode(preferredViewMode);
  localStorage.setItem("process-map-view", preferredViewMode);
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
    preferredViewMode = savedMode === "fit" || savedMode === "actual" ? savedMode : null;
    selectFromHash();
  } catch (error) {
    navigation.innerHTML = '<p class="navigation-status">The process map index could not be loaded.</p>';
    loadingIndicator.textContent = "The process maps are temporarily unavailable.";
    console.error(error);
  }
}

synchroniseNavigationState();
initialise();
