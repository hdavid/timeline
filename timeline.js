
let data = [];

let filterNames = [];
let propertyNames = [];
let groupNames = [];
let customOrders= {}
let singleLineProperties = {};
let configUrl = null;

function adjustBodyMargin() {
    const header = document.querySelector("header");
    const body = document.body;
    const headerHeight = header.offsetHeight;
    body.style.marginTop = headerHeight + "px";
}

async function initTimeline(configUrlParameter) {
    configUrl = configUrlParameter;

    const config = await fetch(configUrl).then(res => res.json());

    if (config.title) {
        document.querySelector("#titleH1").innerHTML = config.title;
    }
    if (config.groupNames) {
        groupNames = config.groupNames;
    }
    if (config.customOrders) {
        customOrders = config.customOrders;
    }
    if (config.singleLineProperties) {
        singleLineProperties = config.singleLineProperties;
    }

    // Load CSS dynamically
    let cssFiles = [];
    if (typeof config.css === "string") {
        cssFiles.push(config.css);
    } else if (Array.isArray(config.css)) {
        cssFiles = config.css;
    }
    for (const cssFile of cssFiles) {
        cssFiles.forEach(cssFile => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssFile;
            document.head.appendChild(link);
        });
    }


    //data files
    let dataFiles = [];
    if (typeof config.data === "string") {
        dataFiles.push(config.data);
    } else if (Array.isArray(config.data)) {
        dataFiles = config.data;
    }

    await loadData(dataFiles);
    sortData();
    computeFilterNames();
    sortData();
    generateFilterUI();
    getFiltersFromHash();
    adjustBodyMargin();
    createTimeline();
    updateTimeline();
    window.addEventListener("resize", updateTimeline);

}

async function loadData(urls) {
    data = [];
    // load data from urls
    for (const url of urls) {
        const response = await fetch(url);
        const jsonArray = await response.json();
        data.push(...jsonArray);
    }
    // parse dates
    const parseDate = d3.timeParse("%Y-%m-%d");
    const formatDate = d3.timeFormat("%Y-%m-%d");
    data.forEach(d => {
        d.startDate = parseDate(d.start);
        if (d.end) {
            d.endDate = parseDate(d.end);
        } else {
            const today = new Date();
            d.end = formatDate(today);         // set d.end as formatted string
            d.endDate = parseDate(d.end);      // parse back into a date object
        }
    });
}

function sortData() {
    let sorter = function(a, b) {
        // 1. Sort by groups (e.g., team, subteam)
        for (const key of groupNames) {
            const aVal = a[key];
            const bVal = b[key];
            if (aVal == null && bVal != null) return -1;
            if (aVal != null && bVal == null) return 1;
            if (aVal !== bVal) return d3.ascending(aVal, bVal);
        }

        // 2. Sort by properties (e.g., type)
        for (const key of propertyNames) {
            const aVal = a[key];
            const bVal = b[key];

            if (aVal == null && bVal != null) return -1;
            if (aVal != null && bVal == null) return 1;

            if (customOrders[key] && (customOrders[key].includes(aVal) || customOrders[key].includes(bVal) ) ) {
                const customOrder = customOrders[key];
                const aIndex = customOrder.indexOf(aVal);
                const bIndex = customOrder.indexOf(bVal);

                const aRank = aIndex !== -1 ? aIndex : customOrder.length;
                const bRank = bIndex !== -1 ? bIndex : customOrder.length;

                if (aRank !== bRank) return aRank - bRank;
            } else {
                if (aVal !== bVal) return d3.ascending(aVal, bVal);
            }
        }

        // 3. Sort by line ID if available
        const aLine = a['line'];
        const bLine = b['line'];
        if (aLine !== bLine) return d3.ascending(aLine, bLine);

        // 4. Sort by start date
        if (a.start !== b.start) return d3.ascending(a.start, b.start);

        // 5. Final fallback: sort by name
        return d3.ascending(a.name, b.name);
    };
    data.sort(sorter);
}

function computeFilterNames() {
    //reset filter div
    document.getElementById("filters").innerHTML = "";

    // properties to exclude from filters
    const exclude = new Set(["name", "start", "startDate", "end", "endDate", "line", "description"]);
    // all properties including groups
    const allFilters = new Set();
    //all properties minus groups
    const allProperties = new Set();

    data.forEach(item => {
        Object.keys(item).forEach(key => {
            if (!exclude.has(key)) {
                allFilters.add(key);
                if (!groupNames.includes(key)) {
                    allProperties.add(key);
                }
            }
        });
    });

    filterNames = Array.from(allFilters);
    propertyNames = Array.from(allProperties);
}


function generateFilterUI() {

    document.getElementById("filters").innerHTML = "";

    for (let filterName of filterNames) {
        const typesSet = new Set();
        let hasMissing = false;

        data.forEach(entry => {
            if (entry[filterName] == null) {
                hasMissing = true;
            } else {
                typesSet.add(entry[filterName]);
            }
        });

        const types = Array.from(typesSet);
        const container = d3.select("#filters").append("div").attr("id", `${filterName}Filter`).attr("class", "filter");
        container.append("label").attr("class", "filter-name").text(`${capitalizeFirstChar(filterName)}`);

        types.forEach(type => {
            const className = `${filterName}-${type}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, '-')
            const label = container.append("label").attr("class", `filter-item ${className}`);
            label.html(`<input type="checkbox" class="${filterName}Filter filter-checkbox" value="${type}" checked><span>${capitalizeFirstChar(type)}</span>`);
            label.on("dblclick", function() {
                const checkbox = label.select("input").node();
                const checkboxesInGroup = d3.selectAll(`.${filterName}Filter`);
                const currentlyChecked = checkboxesInGroup.filter(function() { return this.checked; }).size();

                if (currentlyChecked === 1) {
                    checkboxesInGroup.property("checked", true);
                } else {
                    checkboxesInGroup.property("checked", false);
                    checkbox.checked = true;
                }

                checkbox.dispatchEvent(new Event('change'));
            });
        });

        // Add special "missing" checkbox for missing values
        if (hasMissing) {
            const label = container.append("label").attr("class", "filter-item");
            label.html(`<input type="checkbox" class="${filterName}Filter filter-checkbox" value="__MISSING__" checked><span><i>none</i></span>`);
            label.on("dblclick", function() {
                const checkbox = label.select("input").node();
                const checkboxesInGroup = d3.selectAll(`.${filterName}Filter`);
                const currentlyChecked = checkboxesInGroup.filter(function() { return this.checked; }).size();

                if (currentlyChecked === 1) {
                    checkboxesInGroup.property("checked", true);
                } else {
                    checkboxesInGroup.property("checked", false);
                    checkbox.checked = true;
                }

                checkbox.dispatchEvent(new Event('change'));
            });
        }
    }

    document.querySelectorAll(".filter-checkbox").forEach(cb => {
        cb.addEventListener("change", update);
    });
}


function capitalizeFirstChar(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}


function getId(item) {
    if (Object.entries(singleLineProperties).some(([key, values]) => values.includes(item[key]))) {
        return "custom_" + groupNames.map(key => item[key] ?? "").join("_") + "_" + propertyNames.map(key => item[key] ?? "").join("_") + "_" + item.type;
    } else if (item.line) {
        return "custom_" + item.team + "_" + item.line;
    } else {
        return item.name + "_" + item.team;
    }
}


function getFiltersFromHash() {
    const hash = window.location.hash.substring(1); // Remove the '#' character
    const filters = new URLSearchParams(hash); // Parse the hash as query parameters
    if (filters.size>1) {
        document.querySelectorAll(".filter-checkbox").forEach(cb => {
            cb.checked = false;
        });

        // Iterate over the filter parameters and update the checkbox states
        filterNames.forEach(filterName => {
            const filterValues = filters.getAll(filterName); // Get all values for the filter
            filterValues.forEach(value => {
                const checkbox = d3.select(`#${filterName}Filter .filter-checkbox[value="${value}"]`).node();
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                    //console.warn(`Filter ${filterName} has unknown value ${value}`);
                }
            });
        });
    }
}

function updateHashFromFilters() {
    const filters = new URLSearchParams(); // This will hold the filter states
    filters.append("configUrl", configUrl);
    document.querySelectorAll(".filter-checkbox").forEach(cb => {
        cb.removeEventListener("change", update);
    });
    filterNames.forEach(filterName => {
        // Find all checked checkboxes for the current filter
        const checkedValues = [];
        d3.selectAll(`#${filterName}Filter .filter-checkbox:checked`).each(function() {
            checkedValues.push(this.value);
        });

        // If there are any checked values, add them to the filters object
        if (checkedValues.length > 0) {
            checkedValues.forEach(value => {
                filters.append(filterName, value); // Append each checked value for the filter
            });
        }
    });
    document.querySelectorAll(".filter-checkbox").forEach(cb => {
        cb.addEventListener("change", update);
    });
    // Update the hash in the URL without reloading the page
    window.location.hash = filters.toString();
}


function update() {
    updateHashFromFilters();
    updateTimeline();
}

const margin = { top: 20, right: 40, bottom: 40, left: 40 };

function createTimeline(){
    d3.select("g").remove();
    const svg = d3.select("svg");
    svg.attr("height", window.innerHeight - document.querySelector('#filters').offsetHeight);  // Dynamic height for SVG
    svg.append("g").attr("id","chart").attr("transform", `translate(${margin.left},${margin.top})`);
}

function updateTimeline() {

    let width = window.innerWidth - margin.left - margin.right;
    let height = window.innerHeight - document.querySelector('header#header').offsetHeight - margin.top - margin.bottom;

    const chart = d3.select("#chart");

    // Get active filters
    const filters = {};
    for (let type of filterNames) {
        const checked = document.querySelectorAll(`.${type}Filter:checked`);
        filters[type] = Array.from(checked).map(c => c.value);
    }

    const filtered = data.filter(item =>
        filterNames.every(type => {
            const val = item[type];
            const selected = filters[type];

            return (
                (val != null && selected.includes(val)) ||
                (val == null && selected.includes("__MISSING__"))
            );
        })
    );

    // Axis
    const x = d3.scaleTime()
        .domain(d3.extent(filtered.flatMap(d => [d.startDate, d.endDate])))
        .range([0, width]);

    const y = d3.scaleBand()
        .domain(filtered.map((d, i) => getId(d)))
        .range([0, height])
        .padding(0.1);


    // Clear previous bars
    chart.selectAll("*").remove();

    const bars = chart.selectAll("rect.bars").data(filtered, d => getId(d));

    // delete old bards
    bars.exit().remove();

    // add bars
    const tooltip = d3.select("#tooltip");
    // ENTER new bars
    const barsEnter = bars.enter()
        .append("rect")
        .attr("class", d => {
            const base = "bar";
            const dynamicClasses = Object.entries(d)
                .filter(([key, value]) => value != null && propertyNames.includes(key)) // skip null/undefined
                .map(([key, value]) => {
                    // Replace spaces with underscores, lowercase everything and replace non-CSS chars with hyphens
                    return `${key.toLowerCase()}-${String(value.toLowerCase()).replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, '-')}`;
                }); // optional: replace spaces and non-CSS chars
            return [base, ...dynamicClasses].join(" ");
        })
        .on("mouseover", (event, d) => {
            let html = "";//`<strong>${d.name}</strong>`;
            html += `${d3.timeFormat("%b %d, %Y")(d.startDate)} – ${d3.timeFormat("%b %d, %Y")(d.endDate)}`;
            if (d["description"]) {
                html += '<br>${d.description}';
            }
            for (const groupName of groupNames) {
                if (d[groupName]) {
                    html += `<br>${capitalizeFirstChar(groupName)}: ${d[groupName]}`;
                }
            }
            for (const propertyName of propertyNames) {
                if (d[propertyName]) {
                    html += `<br>${capitalizeFirstChar(propertyName)}: ${d[propertyName]}`;
                }
            }

            tooltip.html(html)
                .style("opacity", 1)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 20) + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    // compute needed space
    const minBarHeight = 20;
    const maxBarHeight = 100;
    const barHeight = Math.max(minBarHeight, Math.min(maxBarHeight, y.bandwidth()));

    // Set SVG height
    const barSpacing = barHeight>30? 10 : 3;
    const uniqueLines = Array.from(new Set(filtered.map(d => getId(d))));
    const neededHeight = uniqueLines.length * (barHeight + barSpacing) + barSpacing;
    d3.select("svg").attr("height", neededHeight + margin.top + margin.bottom);
    // Update Y scale
    y.domain(uniqueLines).range([0, neededHeight]);


    // === GROUP BACKGROUNDS ===
// Group data by combined group key
    const groupKey = d => groupNames.map(k => d[k] ?? "").join("|");
    const grouped = d3.groups(filtered, groupKey);
// Create a container for group backgrounds
    chart.selectAll(".group-background").remove();
    const groupBg = chart.selectAll(".group-background")
        .data(grouped)
        .enter()
        .append("rect")
        .attr("class", (d, i) => (i % 2 === 0 ?  "group-even":"group-odd") + " group-"+d[0].toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, '-'))
        .style("opacity", 0.2)
        .attr("x", -margin.left) // full width including margin
        .attr("width", width + margin.left + margin.right)
        .attr("y", ([_, items]) => {
            const ids = items.map(d => getId(d));
            return d3.min(ids.map(id => y(id))) - barSpacing / 2;
        })
        .attr("height", ([_, items]) => {
            const ids = items.map(d => getId(d));
            const yPositions = ids.map(id => y(id));
            const minY = d3.min(yPositions);
            const maxY = d3.max(yPositions) + barHeight;
            const height = Math.floor(maxY - minY + barSpacing);
            return 1.0*height;
        })
        .lower(); // Push behind everything
    groupBg.exit();

    // groupBg.enter()
    //     .append("text")
    //     .attr("class", "group-label")
    //     .attr("x", 50)  // small left margin
    //     .attr("y", ([_, items]) => {
    //         const ids = items.map(d => getId(d));
    //         const minY = d3.min(ids.map(id => y(id)));
    //         console.log(minY);
    //         return minY - 5; // place slightly above the top bar
    //     })
    //     .text(([key, _]) => "XXXXX")
    //     .style("opacity", 1)
    //     .style("font-size", "50px")
    //     .style("font-weight", "bold")
    //     .style("stroke", "#000")
    //     .style("dominant-baseline", "hanging");


    // UPDATE + ENTER merged
    barsEnter.merge(bars)
        .attr("x", d => x(d.startDate))
        .attr("y", d => y(getId(d)))
        .attr("rx", barHeight /3)
        .attr("ry", barHeight / 3)
        .attr("width", d => Math.max(2, x(d.endDate) - x(d.startDate)))
        .attr("height", d => barHeight); // Apply min height for bars


    // === TEXT LABELS ===
    const labels = chart.selectAll("text.bar-label").data(filtered, d => getId(d));
    labels.enter()
        .append("text")
        .attr("class", "bar-label")
        .style("pointer-events", "none")
        .attr("x", d => x(d.startDate) + 5)
        .attr("y", d => y(getId(d)) + barHeight / 2 +5)
        .attr("width", d => Math.max(2, x(d.endDate) - x(d.startDate)) - 10)
        .text(d => d.name);

    //Year bars
    chart.selectAll(".axis").remove();
    chart.append("g")
        .attr("class", "axis")
        //.attr("transform", `translate(0,${height})`)
        .attr("transform", `translate(0,-20)`)
        .call(d3.axisBottom(x));

    // Draw vertical lines for years
    const yearScale = d3.scaleTime()
        .domain([d3.min(filtered, d => d.startDate), d3.max(filtered, d => d.endDate)])
        .nice(d3.timeYear);

    const years = yearScale.ticks(d3.timeYear);
    chart.selectAll(".year-line")
        .data(years)
        .enter()
        .append("line")
        .attr("class", "year-line")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", -15)
        .attr("y2", neededHeight)
        .style("stroke", "#000")
        .style("stroke-dasharray", "1,5");

   //person counts
    const personCounts = computePersonCountsOverTime(filtered, "team");
    //console.log(personCounts);
    const countX = d3.scaleTime()
        .domain(d3.extent(personCounts, d => d.time))
        .range([0, width]);

    const countY = d3.scaleLinear()
        .domain([0, d3.max(personCounts, d => d.total)])
        .range([height, 0]);

    const line = d3.line()
        .x(d => countX(d.time))
        .y(d => countY(d.total));

    d3.select("#chart")
        .append("path")
        .datum(personCounts)
        .attr("class", "person-total-line")
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", line);

    const yAxis = d3.axisLeft(countY);

// Append the Y-axis to the chart group
    d3.select("#chart")
        .append("g")
        .attr("class", "y-axis")
        .call(yAxis);

}


function computePersonCountsOverTime(data, groupKey, timeStep = d3.timeMonth.every(1)) {
    const people = data.filter(d => d.type === "person");

    // Build time range
    const timeExtent = d3.extent(people.flatMap(d => [d.startDate, d.endDate]));
    const timePoints = timeStep.range(timeExtent[0], d3.timeMonth.offset(timeExtent[1], 1));

    const counts = [];

    for (const time of timePoints) {
        const snapshot = {
            time,
            total: 0,
            groups: {}
        };

        for (const person of people) {
            if (person.startDate <= time && person.endDate >= time) {
                const group = person[groupKey] || "unknown";
                snapshot.total += 1;
                snapshot.groups[group] = (snapshot.groups[group] || 0) + 1;
            }
        }

        counts.push(snapshot);
    }

    return counts;
}


