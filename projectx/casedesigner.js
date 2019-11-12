'use strict';

if (!pdfjsLib.getDocument || !pdfjsViewer.PDFPageView) {
  alert('Please build the pdfjs-dist library using\n' +
        '  `gulp dist-install`');
};

pdfjsLib.GlobalWorkerOptions.workerSrc ='pdfjs/pdf.worker.js';

var CMAP_URL = 'pdfjs/cmaps/';
var CMAP_PACKED = true;

var DEFAULT_URL = 'Designer Help.pdf';
var PAGE_TO_VIEW = 1;
var DEFAULT_SCALE = 1.0;

var pdfLinkService = new pdfjsViewer.PDFLinkService();
var phaseViews = [null];
var currentPDF = null;
var currentCase = null;
var currentPhase = 1;
var currentWidget = null;
let menu = null;
let bullet = null;
var dragged = null;
var alayer = null;
var page = null;
 
var pdfFindController = new pdfjsViewer.PDFFindController({
  linkService: pdfLinkService,
});

if (typeof(Storage) === "undefined") {
	alert("Local storage not supported. Use another browser.");
};

loadDocument(DEFAULT_URL);

function loadDocument(url) {
	var loadingTask = pdfjsLib.getDocument({
	  url: url,
	  cMapUrl: CMAP_URL,
	  cMapPacked: CMAP_PACKED,
	});
	loadingTask.promise.then(function(document) {
		currentPDF = document;
		// temporarily remove local storate
		localStorage.removeItem(url);
		getCase(url,document.numPages);
	    fillPhasePanel();
	    fillToolMenu();
	    showPhase(1);
	});
}

function getCase(url,nphases) {
	currentCase = JSON.parse(localStorage.getItem(url));
	if (!currentCase) {
		currentCase = getNewCase(url,nphases);
		saveCase();
	};
	for (var i = 1; i < currentCase.phases.length; i++)
		loadPhase(currentCase.phases[i]);
}

function getNewCase(url,nphases) {
	var state = "viewing";
	var phases = [null]
	for (var i = 1; i <= nphases; i++) {
		var phase = {
			"id": i,
			"title": "phase "+i,
			"submit": "submit",
			"state": state,
			"widgets": {},
			"tools": []
		};
		phases.push(phase);
		state = "locked";
	};
	return {
		"url": url,
		"wid": 1,
		"phases": phases
	}
}

function saveCase() {
	localStorage.setItem(currentCase.url, JSON.stringify(currentCase));
}
		

function getNewView() {
	var view = document.createElement("div");
	view.id = "viewerContainer";
	view.onmousedown = function(e) {
		if (e.target.tagName === "SELECT") { 
			return;
		};
		if (e.target.textContent === "•") {
			bullet = e.target;
			menu = document.getElementById("addList");
			menu.style.left = bullet.style.left;
		    menu.style.top = bullet.style.top;		    		
			toggleMenu("visible");
			return;
		};
	};
	return view;
}

function loadPhase(phase) {
	phaseViews.push(getNewView());
	currentPDF.getPage(phase.id).then(function (pdfPage) {
	    var pdfPageView = new pdfjsViewer.PDFPageView({
	      container: phaseViews[phase.id],
	      id: phase.id,
	      scale: DEFAULT_SCALE,
	      defaultViewport: pdfPage.getViewport({scale:DEFAULT_SCALE}),
	        linkService: pdfLinkService,
	        findController: pdfFindController,
	        textLayerFactory: new pdfjsViewer.DefaultTextLayerFactory(),
	        annotationLayerFactory: new pdfjsViewer.DefaultAnnotationLayerFactory(),
	        renderInteractiveForms: true,
	    });
	    pdfPageView.setPdfPage(pdfPage);
	    pdfPageView.draw();
	    var pageView = phaseViews[phase.id].getElementsByClassName("page").item(0);
	    // if there are no annotations the annotationLayer will not be added by pdf.js so add one.
	    var layer = phaseViews[phase.id].getElementsByClassName("annotationLayer").item[0];
	    if (!layer) {
	    	layer = document.createElement("div");
	    	layer.className = "annotationLayer";
	    	pageView.appendChild(layer);
	    };
		var menuLayer = document.getElementById("menuLayer");
	    pageView.appendChild(menuLayer.cloneNode(true));
	    redisplayWidgets();
	});	
}

function redisplayWidgets() {}

// swap phase views 
function showPhase(pindex) {
	var phaseButton = document.getElementById("ptitle"+currentPhase);
	phaseButton.removeAttribute("selected");
	var wrapper = document.getElementById("viewerWrapper");
	wrapper.replaceChild(phaseViews[pindex],wrapper.firstElementChild);
	currentPhase = pindex;
	phaseButton = document.getElementById("ptitle"+currentPhase);
	phaseButton.setAttribute("selected","true");
}

function fillPhasePanel() {
	var phasePanel = document.getElementById("phasePanel");
	var title = document.createElement("span");
	title.innerHTML ="Phases:";
	phasePanel.appendChild(title);
	for (var i = 1; i < currentCase.phases.length; i++) {
		var item = document.createElement("div");
		item.className = "phase";
		var button = document.createElement("button");
		button.id = "ptitle"+i;
		button.innerHTML = currentCase.phases[i].title;
		button.value = i;
		item.onclick = function(e) {
	 	 	var r = this.getBoundingClientRect();
			if (e.pageX  > (r.right-16)) {
				menu = document.getElementById("phaseMenu");
				document.getElementById("phaseTitle").value = this.firstElementChild.innerHTML;
				menu.style.left = e.pageX+"px";
				menu.style.top = e.pageY+"px";
				toggleMenu("visible");
			} else
				showPhase(this.firstChild.value);
		};
		item.appendChild(button);
		phasePanel.appendChild(item);
	};
}

function savePhase() {
	var input = document.getElementById("phaseTitle");
    currentCase.phases[currentPhase].title = input.value;
    document.getElementById("ptitle"+currentPhase).innerHTML = input.value;
	saveCase();
	toggleMenu("hidden");
}

function toggleMenu(command) {
	if (menu) menu.style.visibility = command;
	if (command === "visible") {
		var error = menu.getElementsByClassName("error").item(0);
		error.style.visibility = "hidden";
	} else {
		menu = null;
	};
};

function saveList() {
	var listType = getListType();
	if (currentWidget) {
		if (currentWidget.widgetType != listType)
			changeListType(listType);
	} else
		currentWidget = makeList(listType);
	// pick up optional
	saveCase();				
	bullet = null;
	currentWidget = null;
	toggleMenu("hidden");
}

function changeListType(newType) {
	currentWidget.type = "list";
	currentWidget.setAttribute("widgettype",newType);
	var subtype = (newType === "multiplechoice")?"radio":"checkbox";
	var phase = currentCase.phases[currentPhase];
	var list = phase.widgets[currentWidget.id];
	list.widgettype = newType;
	for (var i=1; i <= list.childIds.length; i++) {
		var item = phase.widgets[list.childIds[i-1]];
		item.type = subtype;
		var section = document.getElementById(item.id);
		section.setAttribute("widgettype",subtype);
		console.log(section);
		var input = section.firstElementChild;
		input.type = subtype;
		input.name = (subtype === "radio")?list.id:item.id;
		input.value = i;		
	}
}

function getListType() {
	var radios = document.getElementsByName('listType');
	for (var i = 0, length = radios.length; i < length; i++)
	   if (radios[i].checked) return radios[i].value;
	return "multiplechoice";
}

function makeList(type) {
	var firstLeft = parseInt(bullet.style.left,10);
	var firstTop = parseInt(bullet.style.top,10);
	var list = makeNewWidget(type,firstLeft-6,firstTop-12);
	var listData = currentCase.phases[currentPhase].widgets[list.id];
	var subtype = type === "multiplechoice"?"radio":"checkbox";
	var nextLeft = firstLeft;
	var node = bullet;
	var value = 1;
	while (nextLeft >= firstLeft) {
		if (nextLeft == firstLeft) {
			var itemLeft = parseInt(node.style.left,10)-firstLeft;
			var itemTop = parseInt(node.style.top,10)-firstTop;
			var item = makeNewWidget(subtype,itemLeft,itemTop);
			item.type = subtype;
			listData.childIds.push(item.id);
			var input = item.firstElementChild;
			input.name = (subtype === "radio")?list.id:item.id;
			input.type = subtype;
			input.value = value++;
			item.style.left = itemLeft+"px";
			item.style.top = itemTop+"px";
			list.appendChild(item);
		};
		node = node.nextElementSibling;
		nextLeft = parseInt(node.style.left,10);
	};
	return list;
}

/*
 * Functions to process widget operations
 */
document.getElementById("widgetPanel").onmousedown = function(e) {
	var type = e.target.title;
	if (type === "list") {
		menu = document.getElementById(type);
		menu.style.left = e.pageX+"px";
	    menu.style.top = e.pageY+"px";		    		
		toggleMenu("visible");
	} else
		makeNewWidget(type,e.pageX,e.pageY);
}

function getViewableWidget(type) {
    var element;
    var draggable = true, showmenu = true;
	var widget = document.createElement("section");
    widget.className = "widget";
    widget.setAttribute("widgettype",type);
    switch(type) {
    case "textfield":
        element = document.createElement('input');
        element.type = 'text';
        element.placeholder="Enter text";
    	break;
    case "textarea":
        element = document.createElement('textarea');
        element.placeholder="Enter paragraph";
        break;
    case "select":
        element = document.createElement('select');
        var option = document.createElement("option");
        option.disabled = "disabled";
        option.selected = "selected";
        option.text = "Select item";
        element.add(option);
        break;
    case "carryforward":
        element = document.createElement('div');
        element.className = "carryforward";
        break;
    case "media":
        element = document.createElement('iframe');
        element.className = "media-iframe";
        break;
    case "diagnosticpath":
        element = document.createElement('div');
        element.className = "diagnosticpath";
        draggable = false;
        break;
    case "radio":
        element = document.createElement('input');
        element.type = "radio";
        draggable = false;
        showmenu = false;
        break;
    case "checkbox":
        element = document.createElement('input');
        element.type = "checkbox";
        draggable = false;
        showmenu = false;
        break;
    case "multiplechoice":
    case "checklist":
    	draggable = false;
    	showmenu = true;
    	break;
    default:
    	return;
   };    
	if (showmenu) setMenuHandler(widget);
	if (draggable) setDraggable(widget);	
	if (element) widget.appendChild(element);
	return widget;
}

function makeNewWidget(type,left,top) {
	var widget = getViewableWidget(type);
    var id = (currentCase.wid++).toString();
    widget.id = id;
    currentCase.phases[currentPhase].widgets[id] = {
    	"id": id,
    	"type": type,
    	"rect": widget.getBoundingClientRect(),
    	"value":"",
    	"childIds":[],
    	"optional": false,    	
    };
	switch(type) {
	case "diagnosticpath":
		placeWidget(widget,0,0);
    	break;
	case "radio":
	case "checkbox":
    	placeWidget(widget,left,top);
    	break;
	case "multiplechoice":
	case "checklist":
		widget.style.left =left + "px";
	    widget.style.top = top +'px';	
		break;
 	default:
    	placeWidget(widget,left+5,top+30);
	};
	alayer = document.getElementsByClassName("annotationLayer").item(0);
    alayer.appendChild(widget);
    return widget;
}

function setMenuHandler(widget) {
    widget.onclick = function(e) {
 	 	var r = this.getBoundingClientRect();
	 	var view = document.getElementById("viewerContainer");
	 	var type = this.getAttribute("widgetType");
	    if (e.pageY > (r.top + 16)) return;
	    if (e.pageX < (r.right - 60)) return;
	    // copy
		if (e.pageX < (r.right - 40)) {
			makeNewWidget(type,e.pageX-100,e.pageY-30);
		    return false;
		};
		/* display properties dialog */
	 	if (e.pageX < (r.right - 24)) {
	 		currentWidget = this;
	 		if (type == "multiplechoice" || type === "checklist")
	 			type = "addList";
	    	menu = document.getElementById(type);
	    	if (menu) {
	    		menu.style.left = widget.style.left;
	    	    menu.style.top = widget.style.top;		    		
		    	toggleMenu("visible");
	    	};
	    	return false;
		};
		deleteWidget(widget);
		saveCase();
		return false;
    };
};

function deleteWidget(widget) {
	var phaseData = currentCase.phases[currentPhase].widgets;
	// remove children for lists if any
	phaseData[widget.id].childIds.forEach(function(id) {
		delete phaseData[id];
	});
	delete phaseData[widget.id];		
	widget.parentNode.removeChild(widget);
}

function showFileMenu() {
	if (menu) return;
	menu = document.getElementById("fileMenu");
	toggleMenu("visible");
}

function openPDF() {
	var folder = document.getElementById("folder").files[0];
	var doc = document.getElementById("document").files[0];
	toggleMenu("hidden");
}

function savePDF() {
	toggleMenu("hidden");
}

function placeWidget(widget,pageX,pageY) {
	let view = phaseViews[currentPhase];
	widget.style.left = pageX+"px";
    widget.style.top = (pageY+view.scrollTop-view.offsetTop) +'px';	
}

function setDraggable(widget) {  
  widget.onmousedown = function(e) {
	  //widget.style.position = 'absolute';
	  var left = widget.offsetLeft;
	  var top = widget.offsetTop;
	  var width = widget.offsetWidth;
	  var height = widget.offsetHeight;
	  var offsetX = e.pageX - left;
	  var offsetY = e.pageY - top;
	  
	  moveAt(this.pageX, this.pageY);
	  
	  function moveAt(pageX, pageY) {
	    widget.style.left = pageX - offsetX + 'px';
	    widget.style.top = pageY - offsetY + 'px';
	  };

	  window.onmousemove = function onMouseMove(e) {
		  // don't move if resizing
		  if (widget.clientWidth == width && widget.clientHeight == height)
			  moveAt(e.pageX, e.pageY);
	  };

	  widget.onmouseup = function() {		  
		  window.onmousemove = null;
		  currentCase.phases[currentPhase].widgets[widget.id].rect = widget.getBoundingClientRect();
		  saveCase();
	  };
  };  
}

function saveTextfield() {
	// save data
	var size = document.getElementById("textwidth").value;
	currentWidget.firstElementChild.size = size;
	// optional
	toggleMenu("hidden");
}

function saveTextarea() {
	var r = currentWidget.firstElementChild.getBoundingClientRect();
	//optional
	toggleMenu("hidden");	
}

function saveSelect() {
	// save data
	var options = document.getElementById("select-options").value;
	console.log(options);
	// save data
	toggleMenu("hidden");	
}

function saveCarryforward() {
	var value = document.getElementById("carryForwardSource").value;
	console.log(value);
	// id of source widget
	// save data
	toggleMenu("hidden");	
}

function saveMedia() {
	var src = document.getElementById("iframe-src").value;
	currentWidget.firstElementChild.setAttribute("src",src);
	// save data
	toggleMenu("hidden");	
}
/*
 * Functions to process toolbox operations
 */
var toolMenu = document.getElementById("toolMenu");
var currentTool = null;
var currentTab = null;

function fillToolMenu() {
	toolMenu.innerHTML = "";
	currentCase.phases[currentPhase].tools.forEach(function entry(title) { 
		addToolTab(title,"toolTab");
	});
	addToolTab("+","addTab");
}

toolMenu.addEventListener("mousedown", function(e) {
	e.preventDefault();
	if (e.target.tagName === "IMG")
		showToolsDialog(e);
	else
		selectTool(e.target);
});

function addToolTab(title,className) {
	var item = document.createElement("div");
	item.className = className;
	var element = null;
	if (title === "+") {
		element = document.createElement("img");
		element.src = "assets/toolbox.png";
		element.alt = "Configure tools";
		element.title = "Configure tools";
	} else {
		element = document.createElement("span");
		element.textContent = title;		
	};
	item.appendChild(element);
	toolMenu.appendChild(item);
}

function selectTool(tab) {
	if (currentTab) {
		currentTab.parentElement.removeAttribute("selected");
		currentTab = null;
	}
	currentTab = tab;
	tab.parentElement.setAttribute("selected","true");
	var newTool = document.getElementById(tab.textContent);
	if (newTool == currentTool) {
		currentTool.style.display = "none";
		currentTool = null;
	} else {
		if (currentTool) currentTool.style.display = "none";
		currentTool = newTool;
		currentTool.style.display = "block";
	};
}; 

function showToolsDialog(e) {
	if (menu) return;
	menu = document.getElementById("toolsDialog");
	toggleMenu("visible");	
}

function saveTools() {
	menu = document.getElementById("toolsDialog");
	var tools = [];
	var nodes = menu.children;
	for (let i = 0; i< nodes.length; i++) {
		if (nodes[i].type === "checkbox" && nodes[i].checked) tools.push(nodes[i].value);
	};
	currentCase.phases[currentPhase].tools = tools;
	if (currentTool) {
		currentTool.style.display = "none";
		currentTool.removeAttribute("selected");
		currentTool = null;
	}
	toggleMenu("hidden");
	fillToolMenu();
	saveCase();
}
