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
const diagramLegend = document.querySelector("#diagram-legend");
const primitiveLegend = document.querySelector("#primitive-legend");
const effectLegend = document.querySelector("#effect-legend");
const terminologyGroup = document.querySelector("#terminology-group");
const termList = document.querySelector("#term-list");
const mobileNavigation = window.matchMedia("(max-width: 900px)");
const coarsePointer = window.matchMedia("(any-pointer: coarse)");

let diagrams = [];
let currentDiagram = null;
let menuHeldFocus = false;
let diagramRenderVersion = 0;
let focusHeadingAfterRender = false;
let preferredViewMode = null;
let actionSemantics = null;

const termDefinitions = [
  {
    term: "People Imports",
    meaning: "The page used to upload student and supervisor spreadsheets.",
  },
  {
    term: "Import For",
    meaning: "Selects whether uploaded records will be used for Industrial Placement or Group Project.",
  },
  {
    term: "Academic Year",
    meaning: "The academic session that the records or marks belong to, such as 2026–27.",
  },
  {
    term: "Placement Administrator",
    meaning: "A department staff member who manages placements and completes assigned approval steps.",
  },
  {
    term: "Placement Provider",
    meaning: "The company or other organisation offering the placement.",
  },
  {
    term: "Placement Supervisor",
    meaning: "The academic staff member assigned to supervise a student's placement and assess the placement report.",
  },
  {
    term: "Group Project Supervisor",
    meaning: "The academic staff member assigned to supervise and assess a project group.",
  },
  {
    term: "Placement Advert",
    meaning: "A placement opportunity published for students to view.",
  },
  {
    term: "Approval Sequence",
    meaning: "The ordered list of placement administrators who must review a placement.",
  },
  {
    term: "Draft Group",
    meaning: "A proposed student group that can still be edited before matching is confirmed.",
  },
  {
    term: "Draft Matching",
    meaning: "Proposed student groups and project assignments that administrators can review and edit before confirmation.",
  },
  {
    term: "Matching Algorithm",
    meaning: "The method the app uses to propose student groups and project assignments.",
  },
  {
    term: "Matching Constraints",
    meaning: "Rules that a proposed matching must satisfy, such as group sizes and project capacities.",
  },
  {
    term: "Preference Ranking",
    meaning: "A student's ordered list of preferred projects.",
  },
  {
    term: "Preference Window",
    meaning: "The period during which students can submit project preferences.",
  },
  {
    term: "Allocation",
    meaning: "A confirmed assignment of students to a group and project.",
  },
];

function renderTerms(item) {
  const diagramText = [item.title, item.group, ...item.outline].join(" ").toLocaleLowerCase("en");
  const applicableTerms = termDefinitions.filter(({ term }) => diagramText.includes(term.toLocaleLowerCase("en")));
  termList.replaceChildren();

  for (const { term, meaning } of applicableTerms) {
    const item = document.createElement("div");
    item.className = "term-item";
    const name = document.createElement("dt");
    name.textContent = term;
    const definition = document.createElement("dd");
    definition.textContent = meaning;
    item.append(name, definition);
    termList.append(item);
  }

  terminologyGroup.hidden = !applicableTerms.length;
  return applicableTerms.length;
}

function renderLegend(semantics, usage, item) {
  if (!Array.isArray(semantics.primitives) || !Array.isArray(semantics.effects)) {
    throw new Error("Action semantics must define primitives and effects");
  }
  if (!usage || !Array.isArray(usage.primitives) || !Array.isArray(usage.effects)) {
    throw new Error("Diagram must declare its used action semantics");
  }

  const usedPrimitives = new Set(usage.primitives);
  const usedEffects = new Set(usage.effects);
  const termCount = renderTerms(item);
  diagramLegend.hidden = !usedPrimitives.size && !usedEffects.size && !termCount;

  primitiveLegend.replaceChildren();
  for (const primitive of semantics.primitives) {
    if (!primitive.id || !primitive.label || !primitive.symbol) {
      throw new Error("Interaction primitive is incomplete");
    }
    if (!usedPrimitives.has(primitive.id)) {
      continue;
    }
    const item = document.createElement("li");
    item.className = "legend-item";
    const symbol = document.createElement("span");
    symbol.className = "legend-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = primitive.symbol;
    const label = document.createElement("span");
    label.textContent = primitive.label;
    item.append(symbol, label);
    primitiveLegend.append(item);
  }
  if (primitiveLegend.children.length !== usedPrimitives.size) {
    throw new Error("Diagram uses an unknown interaction primitive");
  }

  effectLegend.replaceChildren();
  for (const effect of semantics.effects) {
    if (!effect.id || !effect.label || !effect.colour) {
      throw new Error("Business effect is incomplete");
    }
    if (!usedEffects.has(effect.id)) {
      continue;
    }
    const item = document.createElement("li");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.backgroundColor = effect.colour;
    swatch.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = effect.label;
    item.append(swatch, label);
    effectLegend.append(item);
  }
  if (effectLegend.children.length !== usedEffects.size) {
    throw new Error("Diagram uses an unknown business effect");
  }
}

function setViewMode(mode) {
  diagramStage.dataset.mode = mode;
  viewMode.setAttribute("aria-pressed", String(mode === "fit"));
}

function applyViewMode(item) {
  const automaticMode = item.id === "overview"
    ? (coarsePointer.matches ? "actual" : "fit")
    : "actual";
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
      diagramTitle.focus({ preventScroll: true });
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
  renderLegend(actionSemantics, item.semantics, item);
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
  localStorage.setItem("process-map-view-semantic", preferredViewMode);
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
    const [manifestResponse, semanticsResponse] = await Promise.all([
      fetch("manifest.json", { cache: "no-store" }),
      fetch("action-semantics.json", { cache: "no-store" }),
    ]);
    if (!manifestResponse.ok) {
      throw new Error(`Manifest request failed with ${manifestResponse.status}`);
    }
    if (!semanticsResponse.ok) {
      throw new Error(`Action semantics request failed with ${semanticsResponse.status}`);
    }
    diagrams = await manifestResponse.json();
    actionSemantics = await semanticsResponse.json();
    renderNavigation(diagrams);

    const savedMode = localStorage.getItem("process-map-view-semantic");
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
