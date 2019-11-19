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
const basicWidgetTypes = ["textfield","textarea","list","select","carryforward","media"];
var jsonPrototypes = {};
var phaseViews = [null];
var currentPDF = null;
var currentCase = null;
var currentPhase = 1;
var currentWidget = null;
var alayer = null;
var page = null;
 
var pdfFindController = new pdfjsViewer.PDFFindController({
  linkService: pdfLinkService,
});

if (typeof(Storage) === "undefined") {
	alert("Browser storage is not supported. Please use another browser.");
};

initJsonPrototypes();

loadDocument(DEFAULT_URL);

/***************************************************************************
 * Cases and Phases functions
*****************************************************************************/

function loadDocument(url) {
	phaseViews = [null];
	var loadingTask = pdfjsLib.getDocument({
	  url: url,
	  cMapUrl: CMAP_URL,
	  cMapPacked: CMAP_PACKED,
	});
	loadingTask.promise.then(function(document) {
		currentPDF = document;
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

function getNewCase(file,nphases) {
	var state = "viewing";
	var phases = [null]
	for (var i = 1; i <= nphases; i++) {
		var phase = {
			"id": i,
			"title": "phase "+i,
			"submit": "Submit",
			"state": state,
			"widgets": {},
			"tools": []
		};
		phases.push(phase);
		state = "locked";
	};
	return {
		"fileName": file.name,
		"wid": 1,
		"widgetbar": basicWidgetTypes,
		"phases": phases
	};
}

function saveCase() {
	localStorage.setItem(currentCase.fileName, JSON.stringify(currentCase));
}
		
function roleChange(role) {
	console.log(role);
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
	    drawPhaseWidgets(phase);
	});	
}

function drawPhaseWidgets(phase) {
	
}

// swap phase views 
function showPhase(pindex) {
	var phaseButton = document.getElementById("ptitle"+currentPhase);
	phaseButton.removeAttribute("selected");
	var wrapper = document.getElementById("viewerWrapper");
	wrapper.replaceChild(phaseViews[pindex],wrapper.firstElementChild);
	currentPhase = pindex;
	phaseButton = document.getElementById("ptitle"+currentPhase);
	phaseButton.setAttribute("selected","true");
	var title = currentCase.phases[pindex].submit;
	document.getElementById("submitButton").firstElementChild.innerHTML = title;
}

function fillPhasePanel() {
	var phasePanel = document.getElementById("phasePanel");
	phasePanel.innerHTML = '';
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
			if (e.pageX  < (r.left+16)) {
				menu = document.getElementById("phaseMenu");
				document.getElementById("phaseTitle").value = this.firstElementChild.innerHTML;
				document.getElementById("submitTitle").value = document.getElementById("submitButton").firstElementChild.innerHTML;
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
	var button = document.getElementById("submitTitle");
    currentCase.phases[currentPhase].submitTitle = button.innerHTML;
    document.getElementById("ptitle"+currentPhase).innerHTML = input.value;
    document.getElementById("submitButton").firstElementChild.innerHTML = button.value;
	saveCase();
	toggleMenu("hidden");
}

/***************************************************************************
 * File functions
*****************************************************************************/
var currentFile = null;

function fileUpload(e) {
	if (menu) return;
	menu = document.getElementById("openFile");
	toggleMenu("visible");
}

function fileDownload(e) {
	if (menu) return;
	menu = document.getElementById("saveFile");
	toggleMenu("visible");
}

function dropHandler(e) {
	e.preventDefault();
	e.stopPropagation();
	var files = [];
	if (e.dataTransfer.items) {
		for (var i = 0; i < e.dataTransfer.items.length; i++) {
			// If dropped items aren't files, reject them
			if (e.dataTransfer.items[i].kind === 'file') {
				var file = e.dataTransfer.items[i].getAsFile();
				files.push(file);
			};
	    };
	 }; 
	if (files.length == 1) {
		var file = files[0];
		if (file.type === "application/pdf") {
			currentFile = file;
			loadDocument(file.name);			
			toggleMenu("hidden");
		} else if (file.type === "application/case" || file.name.endsWith(".case")) {
			currentFile = file;
			getFileBlob(file, function(blob) {
				var view = new DataView(blob);
				var len = view.getUint32(0);
				var reader = new FileReader();
				var fileName = file.name.split(".")[0];
				reader.onload = function(e) {
					localStorage.setItem(fileName+".pdf",reader.result);
					reader.onload = function(e) {loadDocument(reader.result);};
					var pdfData = new Blob([blob.slice(len+4)]);
					reader.readAsDataURL(pdfData);
				};
				reader.readAsText(new Blob([blob.slice(4,len+4)]));
			});
			toggleMenu("hidden");
		} else
			showMenuError("Only PDF and CASE files can be read.")
	} else 
		showMenuError("Please drop only one file.");
	return false;
}

function dragOverHandler(e) {
	e.preventDefault();
	e.stopPropagation();	
}

const getFileBlob = function (file, cb) {
    var reader = new FileReader();
    reader.onload = function(e) { cb(reader.result);};
    reader.readAsArrayBuffer(file);
};

function saveFile() {
	var fileName = document.getElementById("saveFileName").value;
	if (fileName.length == 0) { 
		showMenuError("Please specify a file name.");
		return;
	};
	fileName += ".case";
	if (!currentFile) {
		showMenuError("A PDF file hasn't been opened.");
		return;
	};
	getFileBlob(currentFile, function(blob) {
		var json = localStorage.getItem(currentCase.fileName);
		var lenBuffer = new ArrayBuffer(4);
		var view = new DataView(lenBuffer);
		view.setUint32(0,json.length);
		var url = URL.createObjectURL(new Blob([lenBuffer,json,blob],{type: "application/case"}));
	    var a = document.createElement("a");
	    a.href = url;
	    a.download = fileName;
	    a.click();
	    URL.revokeObjectURL(a.href);
		toggleMenu("hidden");		
	});
}

/***************************************************************************
 * Menu functions
*****************************************************************************/
var menu = null;

function toggleMenu(command) {
	showMenuError("");
	if (menu) menu.style.visibility = command;
	if (command === "visible") {
		if (menu.getAttribute("onVisible")) {
			switch (menu.id) {
			case "carryforward":
			case "textarea":
				var select = menu.getElementsByClassName("cfSources").item(0);
				getCFSources(select);
				break;
			default:
			}
		};
	} else
		menu = null;
};

function showMenuError(msg) {
	if (!menu) return;
	var error = menu.getElementsByClassName("error").item(0);
	error.innerHTML = msg;
	error.style.visibility = (msg.length > 0)?"visible":"hidden";	
}

/***************************************************************************
 * List functions
*****************************************************************************/
var bullet = null;

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

function saveList() {
	var listType = getListType();
	if (currentWidget) {
		if (currentWidget.widgetType != listType)
			changeListType(listType);
	} else
		currentWidget = makeList(listType);
	// pick up required
	saveCase();				
	bullet = null;
	currentWidget = null;
	toggleMenu("hidden");
}


/***************************************************************************
 * Widget functions
*****************************************************************************/
function addPrototype(type,isSource,isTarget,isRequired,isDraggable) {
	jsonPrototypes[type] = {
		"type": type,
		"id": 0,
		"rect": null,
		"value":"",
		"required": isRequired,
		"isSource": isSource,
		"isTarget": isTarget,
		"isDraggable": isDraggable,
		"sources":[],
		"childIds":[]
	};
}

function initJsonPrototypes() {
	addPrototype("textfield",true,true,true,true);
	addPrototype("textarea",true,true,true,true);
	addPrototype("list",true,false,true,false);
	addPrototype("select",true,false,true,true);
	addPrototype("carryforward",false,true,false,true);
	addPrototype("media",false,false,false,true);
	addPrototype("radio",false,false,false,false);
	addPrototype("checkbox",false,false,false,true);
}

function getNewJsonObject(type) {
	console.log(type);
	return JSON.parse(JSON.stringify(jsonPrototypes[type]))
};

document.getElementById("widgetBar").onmousedown = function(e) {
	var type = e.target.title;
	if (type === "list" || type === "configure") {
		menu = document.getElementById(type);
		menu.style.left = e.pageX-100+"px";
	    menu.style.top = e.pageY+"px";		    		
		toggleMenu("visible");
	} else
		makeNewWidget(type,e.pageX,e.pageY);
}

function getViewableWidget(type) {
    var element;
    var draggable = true, showmenu = true;
	var widget = document.createElement("section");
	var wid = document.createElement("span");
	widget.appendChild(wid);
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
        var element = document.createElement("div");
        var iframe = document.createElement('iframe');
        iframe.className = "media-iframe";
        element.appendChild(iframe);
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
    widget.firstChild.innerHTML = "ID:"+id;
    widget.id = id;
    var wrec = getNewJsonObject(type);
    wrec.id = id;
    wrec.rect = widget.getBoundingClientRect();
    if (wrec.isDraggable)
    	placeWidget(widget,left+5,top+30);
    else
    	placeWidget(widget,left,top);
    currentCase.phases[currentPhase].widgets[id] = wrec;
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

function placeWidget(widget,left,top) {
	let view = phaseViews[currentPhase];
	widget.style.left = left+"px";
    widget.style.top = view?(top+view.scrollTop-view.offsetTop) +'px':left+"px";	
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

function getCFSources(select) {
	select.innerHTML = '';
	for (var i = 1; i < currentPhase; i++) {
		var option = document.createElement("option");
		option.text = currentCase.phases[i].title;
		option.disabled = "disabled";
		option.value = 0;
		select.add(option);
		for (var id in currentCase.phases[i].widgets) {
			var widget = currentCase.phases[i].widgets[id];
			if (widget.isSource) {
				option = document.createElement("option");
				option.text = widget.id+": " + widget.type;
				option.value = widget.id;
				select.add(option);
			};
		};
	};
}

function showCFOrder(select) {
	var order = document.getElementById("cfOrder");
	order.value = "";
	for (var i = 0; i < select.options.length; i++) {
		if (select.options[i].selected) {
			var id = select.options[i].value.split(":")[0];
			order.value += (order.value =="")?id:(";"+id);
		}
	};
}

function saveTextfield() {
	var input = currentWidget.getElementsByTagName("input")[0];
	input.size = document.getElementById("textwidth").value;
	input.setAttribute("optional",menu.getElementsByClassName("isoptional")[0].checked);
	console.log(input);
	toggleMenu("hidden");
}

function saveTextarea() {
	var r = currentWidget.firstElementChild.getBoundingClientRect();
	currentWidget.firstElementChild.size = size;
	//optional
	toggleMenu("hidden");	
}

function saveSelect() {
	// save data
	var options = document.getElementById("select-options").value;
	// save data
	toggleMenu("hidden");	
}

function saveCarryforward() {
	var value = document.getElementById("carryForwardSource").value;
	// id of source widget
	// save data
	toggleMenu("hidden");	
}

function saveMedia() {
	var src = document.getElementById("iframe-src").value;
	var iframe = document.getElementsByClassName("media-iframe").item(0);
	iframe.setAttribute("src",src);
	// save data
	toggleMenu("hidden");	
}
/***************************************************************************
 * Toolbox functions
*****************************************************************************/
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
