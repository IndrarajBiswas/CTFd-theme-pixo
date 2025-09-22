(function () {
  const baseUrl = (window.init && window.init.urlRoot) || "";
  const scoreboardGraph = document.getElementById("score-graph");
  const chartContainer = document.getElementById("score-graph-chart");
  const spinner = document.getElementById("score-graph-spinner");
  const bracketWrapper = document.getElementById("scoreboard-brackets");
  const bracketNav = document.getElementById("scoreboard-bracket-nav");
  const standingsBody = document.getElementById("scoreboard-standings");
  const tableContainer = document.getElementById("scoreboard-table-container");
  const emptyState = document.getElementById("scoreboard-empty");

  if (!scoreboardGraph || !chartContainer || !standingsBody) {
    return;
  }

  if (typeof window.echarts === "undefined") {
    console.error("ECharts library is required for the scoreboard page.");
    return;
  }

  let chart = null;
  let standings = [];
  let brackets = [];
  let activeBracket = null;
  const userMode = (window.init && window.init.userMode) || "users";
  const updateInterval = window.scoreboardUpdateInterval || 300000;

  function colorHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 55%)`;
  }

  function cumulativeSum(values) {
    const result = [];
    values.reduce((total, value) => {
      const next = total + value;
      result.push(next);
      return next;
    }, 0);
    return result;
  }

  function mergeOptions(target, source) {
    if (!source) {
      return target;
    }
    const output = Array.isArray(target) ? target.slice() : { ...target };
    Object.keys(source).forEach(key => {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        output[key] = mergeOptions(output[key] || {}, value);
      } else {
        output[key] = value;
      }
    });
    return output;
  }

  function buildChartOption(mode, places, optionMerge) {
    let option = {
      title: {
        left: "center",
        text: "Top 10 " + (mode === "teams" ? "Teams" : "Users"),
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },
      },
      legend: {
        type: "scroll",
        orient: "horizontal",
        align: "left",
        bottom: 35,
        data: [],
      },
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: "none",
          },
          saveAsImage: {},
        },
      },
      grid: {
        containLabel: true,
      },
      xAxis: [
        {
          type: "time",
          boundaryGap: false,
          data: [],
        },
      ],
      yAxis: [
        {
          type: "value",
        },
      ],
      dataZoom: [
        {
          id: "dataZoomX",
          type: "slider",
          xAxisIndex: [0],
          filterMode: "filter",
          height: 20,
          top: 35,
          fillerColor: "rgba(233, 236, 241, 0.4)",
        },
      ],
      series: [],
    };

    const keys = Object.keys(places || {});
    keys.forEach(key => {
      const entry = places[key];
      if (!entry) {
        return;
      }
      const solves = (entry.solves || []).slice();
      const values = solves.map(item => item.value || 0);
      const dates = solves.map(item => new Date(item.date));
      const totals = cumulativeSum(values);
      const seriesData = dates.map((date, index) => [date, totals[index]]);

      option.legend.data.push(entry.name);
      option.series.push({
        name: entry.name,
        type: "line",
        label: {
          normal: {
            position: "top",
          },
        },
        itemStyle: {
          normal: {
            color: colorHash(`${entry.name}${entry.id}`),
          },
        },
        data: seriesData,
      });
    });

    return mergeOptions(option, optionMerge);
  }

  function showSpinner(show) {
    if (!spinner) {
      return;
    }
    spinner.style.display = show ? "" : "none";
  }

  function toggleGraph(show) {
    if (!scoreboardGraph) {
      return;
    }
    if (show) {
      scoreboardGraph.classList.remove("d-none");
      chartContainer.style.display = "";
    } else {
      scoreboardGraph.classList.add("d-none");
    }
  }

  async function fetchJSON(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    const payload = await response.json();
    if (payload.success === false) {
      throw new Error((payload.errors && payload.errors.toString()) || "Unknown error");
    }
    return payload.data;
  }

  function createNavButton(label, value, isActive) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-link" + (isActive ? " active" : "");
    button.textContent = label;
    button.addEventListener("click", () => {
      setActiveBracket(value);
    });
    return button;
  }

  function renderNav() {
    if (!bracketNav || !bracketWrapper) {
      return;
    }
    bracketNav.innerHTML = "";
    if (!brackets.length || !standings.length) {
      bracketWrapper.hidden = true;
      return;
    }

    bracketWrapper.hidden = false;
    bracketNav.appendChild(createNavButton("All", null, activeBracket === null));
    brackets.forEach(bracket => {
      bracketNav.appendChild(
        createNavButton(bracket.name, bracket.id, activeBracket === bracket.id)
      );
    });
  }

  function renderTable() {
    const filtered = activeBracket
      ? standings.filter(item => item.bracket_id === activeBracket)
      : standings.slice();

    standingsBody.innerHTML = "";

    if (!filtered.length) {
      if (tableContainer) {
        tableContainer.classList.add("d-none");
      }
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }

    if (tableContainer) {
      tableContainer.classList.remove("d-none");
    }
    if (emptyState) {
      emptyState.hidden = true;
    }

    filtered.forEach((standing, index) => {
      const row = document.createElement("tr");

      const place = document.createElement("th");
      place.scope = "row";
      place.className = "text-center";
      place.textContent = index + 1;
      row.appendChild(place);

      const nameCell = document.createElement("td");
      nameCell.className = "text-start";
      const nameLink = document.createElement("a");
      nameLink.href = standing.account_url;
      nameLink.textContent = standing.name;
      nameCell.appendChild(nameLink);

      if (standing.bracket_name) {
        const bracketBadge = document.createElement("span");
        bracketBadge.className = "badge bg-secondary ms-2";
        bracketBadge.textContent = standing.bracket_name;
        nameCell.appendChild(bracketBadge);
      }

      if (standing.oauth_id) {
        const mlcLink = document.createElement("a");
        const badge = document.createElement("span");
        badge.className = "badge bg-primary ms-2";
        badge.textContent = "Official";
        mlcLink.appendChild(badge);
        if (userMode === "teams") {
          mlcLink.href = `https://majorleaguecyber.org/t/${encodeURIComponent(standing.name)}`;
        } else {
          mlcLink.href = `https://majorleaguecyber.org/u/${encodeURIComponent(standing.name)}`;
        }
        mlcLink.rel = "noopener";
        mlcLink.target = "_blank";
        nameCell.appendChild(mlcLink);
      }

      row.appendChild(nameCell);

      const scoreCell = document.createElement("td");
      scoreCell.textContent = standing.score;
      row.appendChild(scoreCell);

      standingsBody.appendChild(row);
    });
  }

  function setActiveBracket(value) {
    if (value === activeBracket) {
      return;
    }
    activeBracket = value;
    renderNav();
    renderTable();
    updateGraph();
  }

  async function loadBrackets() {
    try {
      const data = await fetchJSON(`${baseUrl}/api/v1/brackets?type=${encodeURIComponent(userMode)}`);
      brackets = Array.isArray(data) ? data : [];
      if (activeBracket !== null && !brackets.some(bracket => bracket.id === activeBracket)) {
        activeBracket = null;
      }
      renderNav();
    } catch (error) {
      console.error(error);
    }
  }

  async function loadStandings() {
    try {
      const data = await fetchJSON(`${baseUrl}/api/v1/scoreboard`);
      standings = Array.isArray(data) ? data : [];
      renderTable();
      renderNav();
    } catch (error) {
      console.error(error);
    }
  }

  async function updateGraph() {
    if (!chartContainer) {
      return;
    }
    showSpinner(true);
    try {
      const query = activeBracket ? `?bracket_id=${encodeURIComponent(activeBracket)}` : "";
      const data = await fetchJSON(`${baseUrl}/api/v1/scoreboard/top/10${query}`);
      const hasData = data && Object.keys(data).length > 0;

      if (!hasData) {
        if (chart) {
          chart.clear();
        }
        toggleGraph(false);
        return;
      }

      toggleGraph(true);
      if (!chart) {
        chart = echarts.init(chartContainer);
      }
      const option = buildChartOption(userMode, data, window.scoreboardChartOptions);
      chart.setOption(option, true);
    } catch (error) {
      console.error(error);
      if (chart) {
        chart.clear();
      }
    } finally {
      showSpinner(false);
    }
  }

  async function init() {
    await Promise.all([loadBrackets(), loadStandings()]);
    await updateGraph();
    setInterval(() => {
      loadStandings();
      updateGraph();
    }, updateInterval);
  }

  init();
})();
