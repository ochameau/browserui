// Retrieve the UI URL we would like to install
let browserui = new URL(location).searchParams.get("browserui");
if (location.href.startsWith("browserui")) {
  browserui = location.href;
}

// Restore list of previously installed UIs
let browsers = [];

chrome.storage.local.get("browsers", storage => {
  browsers = storage.browsers;
  if (!Array.isArray(browsers)) {
    browsers = [];
  }
  browsers.sort();
  updateList();
});

function install(uri) {
  if (!browsers.includes(uri) && uri != "browserui://") {
    browsers.push(uri);
    chrome.storage.local.set({ browsers }, function () {
      let channel = new BroadcastChannel("confirm");
      channel.postMessage({ uri });
    });
  } else {
    let channel = new BroadcastChannel("confirm");
    channel.postMessage({ uri });
  }
}

let installBtn = document.querySelector(".install");
let url = document.querySelector(".new .url");
let versions = document.querySelector(".versions");
let newBox = document.querySelector(".new");
let resetBtn = document.querySelector(".reset");

if (browserui == "browserui://") {
  newBox.hidden = true;
} else {
  newBox.hidden = false;
  url.textContent = browserui;
}

installBtn.addEventListener("click", function () {
  install(browserui); 
});
resetBtn.addEventListener("click", function () {
  install("browserui://");
});

// Update already used interfaces
function updateList() {
  versions.innerHTML = "";
  for (let ui of browsers) {
    let li = document.createElement("li");
    li.dataset["browserui"] = ui;

    let remove = document.createElement("div");
    remove.className = "remove";
    li.appendChild(remove);

    let name = document.createElement("div");
    name.className = "name";
    name.textContent = ui;
    li.appendChild(name);

    let go = document.createElement("div");
    go.className = "go";
    li.appendChild(go);

    versions.appendChild(li);
  }
}

versions.addEventListener("click", function ({ target }) {
  if (!target.parentNode) return;
  let ui = target.parentNode.dataset["browserui"];
  if (target.classList.contains("go")) {
    install(ui);
  } else if (target.classList.contains("remove")) {
    let idx = browsers.indexOf(ui);
    if (idx != -1) {
      browsers.splice(idx, 1);
      chrome.storage.local.set({ browsers });
    }
    target.parentNode.remove();
  }
});
