﻿/*global define,dojo,dijit,dojoConfig,alert,esri */
/*jslint browser:true,sloppy:true,nomen:true,unparam:true,plusplus:true,indent:4 */
/*
 | Copyright 2013 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
//============================================================================================================================//
define([
    "dojo/_base/declare",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/_base/lang",
    "esri/arcgis/utils",
    "dojo/dom",
    "dojo/dom-attr",
    "dojo/query",
    "dojo/dom-class",
    "dijit/_WidgetBase",
    "dojo/i18n!application/js/library/nls/localizedStrings",
    "esri/map",
    "esri/layers/ImageParameters",
    "esri/layers/FeatureLayer",
    "esri/layers/GraphicsLayer",
    "widgets/baseMapGallery/baseMapGallery",
    "widgets/legends/legends",
    "esri/geometry/Extent",
    "esri/dijit/HomeButton",
    "dojo/Deferred",
    "dojo/DeferredList",
    "dojo/topic",
    "dojo/on",
    "widgets/infoWindow/infoWindow",
    "dojo/text!../infoWindow/templates/infoWindow.html",
    "esri/layers/ArcGISDynamicMapServiceLayer",
    "esri/layers/ArcGISTiledMapServiceLayer",
    "esri/layers/OpenStreetMapLayer",
    "dojo/_base/array",
    "esri/graphic",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleFillSymbol",
    "dojo/string",
    "dojo/_base/Color",
    "dojo/domReady!"
], function (declare, domConstruct, domStyle, lang, esriUtils, dom, domAttr, query, domClass, _WidgetBase, sharedNls, esriMap, ImageParameters, FeatureLayer, GraphicsLayer, BaseMapGallery, Legends, GeometryExtent, HomeButton, Deferred, DeferredList, topic, on, InfoWindow, template, ArcGISDynamicMapServiceLayer, ArcGISTiledMapServiceLayer, OpenStreetMapLayer, array, Graphic, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, string, Color) {

    //========================================================================================================================//

    return declare([_WidgetBase], {

        map: null,
        templateString: template,
        tempGraphicsLayerId: "esriGraphicsLayerMapSettings",
        tempBufferLayer: "tempBufferLayer",
        sharedNls: sharedNls,
        infoWindowPanel: null,
        prevOrientation: window.orientation,
        operationalLayers: [],
        _mapLoaded: false,
        _widgetsInitialized: false,
        setExtent: false,
        _operationLayersLoaded: false,
        operationLayersCount: 0,

        /**
        * initialize map object
        *
        * @class
        * @name widgets/mapSettings/mapSettings
        */
        postCreate: function () {
            var mapDeferred, layer, i, windowWidth, LegendWidthChange;
            dojo.operationLayerSettings = [];
            topic.publish("showProgressIndicator");
            topic.subscribe("setInfoWindowOnMap", lang.hitch(this, function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight, count) {
                this._onSetInfoWindowPosition(infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight, count);
            }));

            topic.subscribe("widgetInitialized", lang.hitch(this, this._setLoatorInstance));
            /**
            * load map
            * @param {string} dojo.configData.BaseMapLayers Basemap settings specified in configuration file
            */
            this.infoWindowPanel = new InfoWindow({ infoWindowWidth: dojo.configData.InfoPopupWidth, infoWindowHeight: dojo.configData.InfoPopupHeight });
            if (dojo.configData.WebMapId && lang.trim(dojo.configData.WebMapId).length !== 0) {
                mapDeferred = esriUtils.createMap(dojo.configData.WebMapId, "esriCTParentDivContainer", {
                    mapOptions: {
                        slider: true,
                        showAttribution: true
                    },
                    ignorePopups: true
                });
                mapDeferred.then(lang.hitch(this, function (response) {
                    topic.subscribe("getWebMapResponse", lang.hitch(this, function () {
                        topic.publish("webMapResponse", response);
                    }));
                    clearTimeout(this.stagedSearch);
                    this.map = response.map;
                    dojo.selectedBasemapIndex = null;
                    if (response.itemInfo.itemData.baseMap.baseMapLayers) {
                        this._setBasemapLayerId(response.itemInfo.itemData.baseMap.baseMapLayers);
                    }
                    topic.publish("filterRedundantBasemap", response.itemInfo);
                    this._fetchWebMapData(response);
                    topic.publish("setMap", this.map);
                    topic.publish("hideProgressIndicator");
                    this._mapLoaded = true;
                    this._dependeciesLoadedEventHandler();
                    this._mapOnLoad();
                    this._mapEvents();
                    if (dojo.configData.ShowLegend) {
                        setTimeout(lang.hitch(this, function () {
                            this._createWebmapLegendLayerList(response.itemInfo.itemData.operationalLayers);
                        }), 5000);
                    }
                }), lang.hitch(this, function (error) {
                    domStyle.set(dom.byId("esriCTParentDivContainer"), "display", "none");
                    alert(error.message);
                }));
            } else {
                this._generateLayerURL(dojo.configData.OperationalLayers);
                this.map = esriMap("esriCTParentDivContainer", {
                    showAttribution: true
                });

                this.map.on("load", lang.hitch(this, function () {
                    this._mapOnLoad();
                    this._mapLoaded = true;
                    this._dependeciesLoadedEventHandler();
                    if (dojo.configData.ShowLegend) {
                        setTimeout(lang.hitch(this, function () {
                            this._addLayerLegend();
                        }), 2000);
                    }
                }));
                dojo.selectedBasemapIndex = 0;
                if (!dojo.configData.BaseMapLayers[0].length) {
                    if (dojo.configData.BaseMapLayers[0].layerType === "OpenStreetMap") {
                        layer = new OpenStreetMapLayer({ id: "defaultBasemap", visible: true });
                    } else {
                        layer = new ArcGISTiledMapServiceLayer(dojo.configData.BaseMapLayers[0].MapURL, { id: "defaultBasemap", visible: true });
                    }
                    this.map.addLayer(layer, 0);
                } else {
                    for (i = 0; i < dojo.configData.BaseMapLayers[0].length; i++) {
                        layer = new ArcGISTiledMapServiceLayer(dojo.configData.BaseMapLayers[0][i].MapURL, { id: "defaultBasemap" + i, visible: true });
                        this.map.addLayer(layer, i);
                    }
                }
                this._mapEvents();
            }

            if (window.orientation !== undefined && window.orientation !== null) {
                on(window, "orientationchange", lang.hitch(this, function () {
                    if (this.prevOrientation !== window.orientation) {
                        this.prevOrientation = window.orientation;
                        topic.publish("resizeAOIPanel", 500);
                        topic.publish("resizeReportsPanel");
                        topic.publish("resizeDialogBox");

                        setTimeout(lang.hitch(this, function () {
                            windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                            if (dojo.setLegnedWidth) {
                                domStyle.set(dojo.query('.esriCTdivLegendbox')[0], "width", (windowWidth + 2) + 'px');
                            } else {
                                LegendWidthChange = windowWidth - parseInt(document.getElementById('esriCTAOIContainer').clientWidth, 10);
                                domStyle.set(dojo.query('.esriCTdivLegendbox')[0], "width", (LegendWidthChange + 2) + 'px');
                            }

                        }), 1000);
                    }
                }));
            } else {
                on(window, "resize", lang.hitch(this, function () {
                    if (this.prevOrientation !== window.orientation || window.orientation === undefined || window.orientation === null) {
                        this.prevOrientation = window.orientation;
                        topic.publish("resizeAOIPanel", 500);
                        topic.publish("resizeReportsPanel");
                        topic.publish("resizeDialogBox");

                        setTimeout(lang.hitch(this, function () {
                            windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
                            if (dojo.setLegnedWidth && dojo.query('.esriCTHeaderReportContainer').length > 0) {
                                domStyle.set(dojo.query('.esriCTdivLegendbox')[0], "width", (windowWidth + 4) + 'px');
                            } else {
                                LegendWidthChange = windowWidth - parseInt(document.getElementById('esriCTAOIContainer').clientWidth, 10);
                                if (dojo.query('.esriCTdivLegendbox').length > 0) {
                                    domStyle.set(dojo.query('.esriCTdivLegendbox')[0], "width", (LegendWidthChange + 2) + 'px');

                                }
                            }
                        }), 1000);

                    }
                }));
            }
            topic.subscribe("widgetInitialized", lang.hitch(this, function (evt) {
                this._widgetsInitialized = true;
                this._dependeciesLoadedEventHandler();
            }));
            topic.subscribe("displayInfoWindow", lang.hitch(this, function (evt) {
                this.setExtent = true;
                this._displayInfoWindow(evt);
            }));

            topic.subscribe("showInfoWindowOnMap", lang.hitch(this, function (mapPoint, featureID) {
                this.setExtent = true;
                this._executeQueryForObjectID(mapPoint, featureID);
            }));

            topic.subscribe("sharedLocatorFeature", lang.hitch(this, this._addLocatorFeature));

            window.onkeydown = function (e) {
                if ((e.keyCode === 9 || e.which === 9) && dojo.isSplashScreenOn) {
                    return false;
                }
            };
        },

        /**
        * check if application is fully loaded with all widgets, operation layers and map
        * @memberOf widgets/mapSettings/mapSettings
        */
        _dependeciesLoadedEventHandler: function () {
            if (this._mapLoaded && this._widgetsInitialized && this._operationLayersLoaded) {
                topic.publish("modulesLoaded");
            }
        },

        /**
        * create a unified search locator instance and handle the address search events
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setLoatorInstance: function () {
            var i, infoIndex, locatorInstance;
            locatorInstance = dijit.byId("locator");
            dojo.locatorSelectFeature = false;
            //address is selected from the address list
            locatorInstance.candidateClicked = lang.hitch(this, function (graphic) {
                if (graphic.geometry) {
                    //when query result is selected
                    if (graphic.geometry.type === "point") {
                        //for point geometry, create and display an infoPopup
                        topic.publish("infoWindowData", graphic);
                        topic.publish("infoWindowVisibilityStatus", true);
                        topic.publish("shareLocatorAddress", [graphic.geometry], false, graphic.name);
                        for (i = 0; i < dojo.operationLayerSettings.length; i++) {
                            if (parseInt(graphic.layer.QueryLayerId, 10) === parseInt(dojo.operationLayerSettings[i].layerID, 10) && graphic.layer.Title === dojo.operationLayerSettings[i].layerTitle) {
                                infoIndex = i;
                                break;
                            }
                        }
                        this._createInfoWindowContent(null, graphic.geometry, graphic.attributes, graphic.fields, infoIndex, null, null, false);
                    } else {
                        //for polygon geometry, highlight the feature
                        this.map.setExtent(graphic.geometry.getExtent());
                        this._addLocatorFeature(graphic.geometry, graphic.name);
                    }
                    topic.publish("resetAOITab");
                } else {
                    //when address result is selected
                    topic.publish("shareLocatorAddress", [locatorInstance.mapPoint], false, graphic.name);
                }
            });
            locatorInstance.onGraphicAdd = lang.hitch(this, function () {
                // when graphic is added by locator tab, show clearGraphics Icon and reset the AOI tab
                topic.publish("showClearGraphicsIcon");
                topic.publish("resetAOITab");
            });
            topic.subscribe("toggleWidget", lang.hitch(this, function (widget) {
                //if address search textBox is blank, set the default address search value in the textbox
                if (widget === "locator" && locatorInstance.lastSearchString === "") {
                    topic.publish("setDefaultTextboxValue", locatorInstance.txtAddress, "defaultAddress", dojo.configData.LocatorSettings.LocatorDefaultAddress);
                }
            }));
        },

        /**
        * highlight the polygon feature on map in case of locator query result selection
        * @param {object} geometry geometry of feature
        * @param {object} addr selected query result
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addLocatorFeature: function (geometry, addr) {
            var highlightGraphic, highlightSymbol;
            highlightSymbol = new SimpleFillSymbol(SimpleFillSymbol.STYLE_SOLID,
                new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID,
                    new Color([
                        parseInt(dojo.configData.HighlightFeaturesSymbology.LineSymbolColor.split(",")[0], 10),
                        parseInt(dojo.configData.HighlightFeaturesSymbology.LineSymbolColor.split(",")[1], 10),
                        parseInt(dojo.configData.HighlightFeaturesSymbology.LineSymbolColor.split(",")[2], 10),
                        parseFloat(dojo.configData.HighlightFeaturesSymbology.LineSymbolTransparency.split(",")[0], 10)
                    ]), 2),
                new Color([
                    parseInt(dojo.configData.HighlightFeaturesSymbology.FillSymbolColor.split(",")[0], 10),
                    parseInt(dojo.configData.HighlightFeaturesSymbology.FillSymbolColor.split(",")[1], 10),
                    parseInt(dojo.configData.HighlightFeaturesSymbology.FillSymbolColor.split(",")[2], 10),
                    parseFloat(dojo.configData.HighlightFeaturesSymbology.FillSymbolTransparency.split(",")[0], 10)
                ]));
            highlightGraphic = new Graphic(geometry, highlightSymbol);
            this.map.getLayer("esriGraphicsLayerMapSettings").add(highlightGraphic);
            topic.publish("shareLocatorAddress", [geometry], false, addr);
            topic.publish("showClearGraphicsIcon");
            dojo.locatorSelectFeature = true;
        },

        _createWebmapLegendLayerList: function (layers) {
            var i, webMapLayers = [], webmapLayerList = {}, hasLayers = false;
            for (i = 0; i < layers.length; i++) {
                if (layers[i].visibility) {
                    if (layers[i].layerDefinition && layers[i].layerDefinition.drawingInfo) {
                        webmapLayerList[layers[i].url] = layers[i];
                        hasLayers = true;
                    } else {
                        webMapLayers.push(layers[i]);
                    }
                }
            }

            this._addLayerLegendWebmap(webMapLayers, webmapLayerList, hasLayers);
        },
        /**
        * set default id for basemaps
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapLayerId: function (baseMapLayers) {
            var i = 0, defaultId = "defaultBasemap";
            if (baseMapLayers.length === 1) {
                this._setBasemapId(baseMapLayers[0], defaultId);
            } else {
                for (i = 0; i < baseMapLayers.length; i++) {
                    this._setBasemapId(baseMapLayers[i], defaultId + i);
                }
            }

        },

        /**
        * set default id for each basemap of webmap
        * @memberOf widgets/mapSettings/mapSettings
        */
        _setBasemapId: function (basmap, defaultId) {
            var layerIndex;
            this.map.getLayer(basmap.id).id = defaultId;
            this.map._layers[defaultId] = this.map.getLayer(basmap.id);
            layerIndex = array.indexOf(this.map.layerIds, basmap.id);
            if (basmap.id !== defaultId) {
                delete this.map._layers[basmap.id];
            }
            this.map.layerIds[layerIndex] = defaultId;

        },

        _fetchWebMapData: function (response) {
            var i, j, k, webMapDetails, layerInfo;
            webMapDetails = response.itemInfo.itemData;
            for (i = 0; i < webMapDetails.operationalLayers.length; i++) {
                if (webMapDetails.operationalLayers[i].visibility) {
                    //create operation layers array
                    this._createWebmapOperationLayer(webMapDetails.operationalLayers[i]);
                    //set infowWindowData for each operation layer
                    if (webMapDetails.operationalLayers[i].layers) {
                        //Fetching infopopup data in case the layers are added as dynamic layers in the webmap
                        for (j = 0; j < webMapDetails.operationalLayers[i].layers.length; j++) {
                            layerInfo = webMapDetails.operationalLayers[i].layers[j];
                            //check the operation layer before creating the infoWindow data
                            for (k = 0; k < dojo.operationLayerSettings.length; k++) {
                                if (webMapDetails.operationalLayers[i].title === dojo.operationLayerSettings[k].layerTitle && dojo.operationLayerSettings[k].layerID === layerInfo.id) {
                                    //set infoWindow content to operation layer
                                    dojo.operationLayerSettings[k].infoWindowData = {};
                                    break;
                                }
                            }
                            if (dojo.operationLayerSettings[k] && dojo.operationLayerSettings[k].infoWindowData) {
                                this._createWebMapInfoWindowData(layerInfo, dojo.operationLayerSettings[k].infoWindowData);
                            }
                        }
                    } else if (webMapDetails.operationalLayers[i].popupInfo) {
                        //Fetching infopopup data in case the layers are added as feature layers in the webmap
                        layerInfo = webMapDetails.operationalLayers[i];
                        //check the operation layer before creating the infoWindow data
                        for (k = 0; k < dojo.operationLayerSettings.length; k++) {
                            if (dojo.operationLayerSettings[k].layerURL === webMapDetails.operationalLayers[i].url) {
                                //set infoWindow content to operation layer
                                dojo.operationLayerSettings[k].infoWindowData = {};
                                break;
                            }
                        }
                        if (dojo.operationLayerSettings[k] && dojo.operationLayerSettings[k].infoWindowData) {
                            this._createWebMapInfoWindowData(layerInfo, dojo.operationLayerSettings[k].infoWindowData);
                        }
                    }
                }
            }
        },

        //create operation layer object depending on the default visibility of layer and populate in an array
        _createWebmapOperationLayer: function (layer) {
            var url, urlArray, lastIndex, i, j, operationLayer, searchSettings = dojo.configData.SearchSettings;
            urlArray = layer.url.split('/');
            lastIndex = urlArray[urlArray.length - 1];
            //create a temp service url
            if (isNaN(lastIndex) || lastIndex === "") {
                if (lastIndex === "") {
                    url = layer.url;
                } else {
                    url = layer.url + "/";
                }
            } else {
                url = layer.url.substring(0, layer.url.lastIndexOf("/") + 1);
            }
            //create an object of opertaion layer
            if (layer.layerObject.layerInfos) {
                //layer is added as dynamic layer in the webmap
                for (i = 0; i < layer.layerObject.layerInfos.length; i++) {
                    operationLayer = {};
                    //check the operation layer default visibility
                    if (layer.layerObject.layerInfos[i].defaultVisibility) {
                        //set the opertaion layer title
                        operationLayer.layerTitle = lang.trim(layer.title);
                        //set the opertaion layer ID
                        operationLayer.layerID = layer.layerObject.layerInfos[i].id;
                        //set the opertaion layer service URL
                        if (isNaN(lastIndex) || lastIndex === "") {
                            operationLayer.layerURL = url + layer.layerObject.layerInfos[i].id;
                        } else {
                            operationLayer.layerURL = url;
                        }
                        //set searchSetting for operation layer if available
                        for (j = 0; j < searchSettings.length; j++) {
                            if (lang.trim(layer.title) === searchSettings[j].Title && layer.layerObject.layerInfos[i].id === parseInt((searchSettings[j].QueryLayerId), 10)) {
                                searchSettings[j].QueryURL = operationLayer.layerURL;
                                break;
                            }
                        }
                        dojo.operationLayerSettings.push(operationLayer);
                    }
                }
            } else {
                //layer is added as feature layer in webmap
                operationLayer = {};
                //set the opertaion layer title
                operationLayer.layerTitle = lang.trim(layer.title);
                //set the opertaion layer ID
                operationLayer.layerID = layer.layerObject.layerId;
                //set the opertaion layer service URL
                operationLayer.layerURL = layer.url;
                //set searchSetting for operation layer if available
                for (j = 0; j < searchSettings.length; j++) {
                    if (lang.trim(layer.title) === searchSettings[j].Title && layer.layerObject.layerId === parseInt((searchSettings[j].QueryLayerId), 10)) {
                        searchSettings[j].QueryURL = operationLayer.layerURL;
                        break;
                    }
                }
                dojo.operationLayerSettings.push(operationLayer);
            }
            this._operationLayersLoaded = true;
            this._dependeciesLoadedEventHandler();
        },

        //set infoWindow fields in an array in infoWindow content
        _createWebMapInfoWindowData: function (layerInfo, infoWindowData) {
            var i, infoWindowHeaderField, field;
            //set infowWindow header field with title and attribute
            if (layerInfo.popupInfo && layerInfo.popupInfo.title.split("{").length > 1) {
                infoWindowHeaderField = lang.trim(layerInfo.popupInfo.title.split("{")[0]) + " ";
                for (i = 1; i < layerInfo.popupInfo.title.split("{").length; i++) {
                    infoWindowHeaderField += "${" + lang.trim(layerInfo.popupInfo.title.split("{")[i]);
                }
            } else if (layerInfo.popupInfo) {
                if (lang.trim(layerInfo.popupInfo.title) !== "") {
                    infoWindowHeaderField = lang.trim(layerInfo.popupInfo.title);
                } else {
                    infoWindowHeaderField = sharedNls.showNullValue;
                }
            }
            infoWindowData.infoWindowHeader = infoWindowHeaderField;
            //populate infoWindow fieldname and display text
            infoWindowData.infoWindowfields = [];
            if (layerInfo.popupInfo) {
                for (field in layerInfo.popupInfo.fieldInfos) {
                    if (layerInfo.popupInfo.fieldInfos.hasOwnProperty(field)) {
                        if (layerInfo.popupInfo.fieldInfos[field].visible) {
                            infoWindowData.infoWindowfields.push({
                                "DisplayText": layerInfo.popupInfo.fieldInfos[field].label + ":",
                                "FieldName": "${" + layerInfo.popupInfo.fieldInfos[field].fieldName + "}"
                            });
                        }
                    }
                }
            }
        },

        _mapEvents: function () {
            this.map.on("extent-change", lang.hitch(this, function () {
                this._onSetMapTipPosition(dojo.selectedMapPoint, this.map, this.infoWindowPanel);
            }));
            this.map.on("click", lang.hitch(this, function (evt) {
                this._displayInfoWindow(evt);
            }));
        },

        // This function is used to display info window
        _displayInfoWindow: function (evt) {
            try {
                if (!dojo.activatedDrawTool && !dojo.locateInitialCoordinates && !dojo.selectFeatureEnabled) {
                    this._showInfoWindowOnMap(evt.mapPoint);
                    topic.publish("infoWindowData", evt.mapPoint);
                    topic.publish("infoWindowVisibilityStatus", true);
                }
            } catch (err) {
                alert(err.message);
            }
        },

        _mapOnLoad: function () {
            var home, extentPoints, mapDefaultExtent, i, imgCustomLogo, imgSource, graphicsLayer, extent, searchSettings;
            searchSettings = dojo.configData.SearchSettings;
            /**
            * set map extent to default extent specified in configuration file
            * @param {string} dojo.configData.DefaultExtent Default extent of map specified in configuration file
            */
            extentPoints = dojo.configData && dojo.configData.DefaultExtent && dojo.configData.DefaultExtent.split(",");
            extent = this._getQueryString('extent');
            if (extent === "") {
                if (!dojo.configData.WebMapId) {
                    mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(extentPoints[0]), "ymin": parseFloat(extentPoints[1]), "xmax": parseFloat(extentPoints[2]), "ymax": parseFloat(extentPoints[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid} });
                    this.map.setExtent(mapDefaultExtent);
                }
            } else {
                mapDefaultExtent = extent.split(',');
                mapDefaultExtent = new GeometryExtent({ "xmin": parseFloat(mapDefaultExtent[0]), "ymin": parseFloat(mapDefaultExtent[1]), "xmax": parseFloat(mapDefaultExtent[2]), "ymax": parseFloat(mapDefaultExtent[3]), "spatialReference": { "wkid": this.map.spatialReference.wkid} });
                this.map.setExtent(mapDefaultExtent);
            }
            /**
            * load esri 'Home Button' widget
            */
            home = this._addHomeButton();
            home.extent = mapDefaultExtent;
            /* set position of home button widget after map is successfully loaded
            * @param {array} dojo.configData.OperationalLayers List of operational Layers specified in configuration file
            */
            domConstruct.place(home.domNode, query(".esriSimpleSliderIncrementButton")[0], "after");
            home.startup();
            if (dojo.configData.CustomLogoUrl && lang.trim(dojo.configData.CustomLogoUrl).length !== 0) {
                if (dojo.configData.CustomLogoUrl.match("http:") || dojo.configData.CustomLogoUrl.match("https:")) {
                    imgSource = dojo.configData.CustomLogoUrl;
                } else {
                    imgSource = dojoConfig.baseURL + dojo.configData.CustomLogoUrl;
                }
                imgCustomLogo = domConstruct.create("img", { "src": imgSource, "class": "esriCTCustomMapLogo" }, dom.byId("esriCTParentDivContainer"));
                if (dojo.configData.ShowLegend) {
                    domClass.add(imgCustomLogo, "esriCTCustomMapLogoBottom");
                } else {
                    domClass.add(imgCustomLogo, "esriCTCustomMapLogoNoLegend");
                }
            }
            if (!dojo.configData.WebMapId) {
                for (i in dojo.configData.OperationalLayers) {
                    if (dojo.configData.OperationalLayers.hasOwnProperty(i)) {
                        this._addOperationalLayerToMap(i, dojo.configData.OperationalLayers[i]);
                    }
                }
            }
            if (dojo.configData.BaseMapLayers.length > 1) {
                this._showBaseMapGallery();
            }
            graphicsLayer = new GraphicsLayer();
            graphicsLayer.id = this.tempGraphicsLayerId;
            graphicsLayer.spatialReference = this.map.extent.spatialReference;
            this.map.addLayer(graphicsLayer);

            graphicsLayer = new GraphicsLayer();
            graphicsLayer.id = this.tempBufferLayer;
            this.map.addLayer(graphicsLayer);
            graphicsLayer.on("graphic-add", lang.hitch(this, function () {
                topic.publish("showClearGraphicsIcon");
            }));
            this.map.on("resize", lang.hitch(this, function (evt) {
                topic.publish("resizeAOIPanel", 1000);
            }));
        },

        _onSetMapTipPosition: function (selectedPoint, map, infoWindow) {
            if (selectedPoint) {
                var screenPoint = map.toScreen(selectedPoint);
                screenPoint.y = map.height - screenPoint.y;
                infoWindow.setLocation(screenPoint);
            }
        },

        _onSetInfoWindowPosition: function (infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight) {
            this.infoWindowPanel.resize(infoPopupWidth, infoPopupHeight);
            this.infoWindowPanel.hide();
            this.infoWindowPanel.setTitle(infoTitle);
            this.infoWindowPanel.show(divInfoDetailsTab, screenPoint);
            if (this.setExtent) {
                this.setExtent = false;
                topic.publish("setMapExtent");
            }
        },

        _showInfoWindowOnMap: function (mapPoint) {
            var index, deferredListResult,
                onMapFeaturArray = [],
                featureArray = [];

            this.counter = 0;
            for (index = 0; index < dojo.operationLayerSettings.length; index++) {
                if (dojo.operationLayerSettings[index].infoWindowData) {
                    this._executeQueryTask(index, mapPoint, onMapFeaturArray);
                }
            }
            deferredListResult = new DeferredList(onMapFeaturArray);
            deferredListResult.then(lang.hitch(this, function (result) {
                var j, i;

                if (result) {
                    for (j = 0; j < result.length; j++) {
                        if (result[j][0] === true) {
                            if (result[j][1].features.length > 0) {
                                for (i = 0; i < result[j][1].features.length; i++) {
                                    featureArray.push({
                                        attr: result[j][1].features[i],
                                        layerId: result[j][1].layerIndex,
                                        fields: result[j][1].fields
                                    });
                                }
                            }
                        }
                    }
                    this._fetchQueryResults(mapPoint, featureArray);
                }
            }), function (err) {
                alert(err.message);
            });
        },

        _executeQueryTask: function (index, mapPoint, onMapFeaturArray) {
            var queryTask, queryParams, layerIndex = index, isLayerVisible, currentTime = new Date().getTime() + index.toString(),
                deferred = new Deferred();
            queryTask = new esri.tasks.QueryTask(dojo.operationLayerSettings[index].layerURL);
            queryParams = new esri.tasks.Query();
            queryParams.outSpatialReference = this.map.spatialReference;
            queryParams.returnGeometry = false;
            queryParams.geometry = this._extentFromPoint(mapPoint);
            queryParams.outFields = ["*"];
            isLayerVisible = this._checkLayerVisibility(dojo.operationLayerSettings[index].layerURL);
            if (isLayerVisible) {
                queryParams.where = currentTime + "=" + currentTime;
            } else {
                queryParams.where = "1=2";
            }
            queryTask.execute(queryParams, lang.hitch(this, function (results) {
                results.layerIndex = layerIndex;
                deferred.resolve(results);
            }), function (err) {
                deferred.reject();
            });
            onMapFeaturArray.push(deferred);
        },

        _executeQueryForObjectID: function (mapPoint, featureIDArray) {
            var queryTask, queryParams, featureArray = [], isLayerVisible, currentTime = new Date().getTime() + featureIDArray[1].toString(),
                deferred = new Deferred();
            queryTask = new esri.tasks.QueryTask(dojo.operationLayerSettings[featureIDArray[1]].layerURL);
            queryParams = new esri.tasks.Query();
            queryParams.outSpatialReference = this.map.spatialReference;
            queryParams.returnGeometry = false;
            queryParams.geometry = mapPoint;
            queryParams.outFields = ["*"];
            isLayerVisible = this._checkLayerVisibility(dojo.operationLayerSettings[featureIDArray[1]].layerURL);
            if (isLayerVisible) {
                queryParams.where = currentTime + "=" + currentTime;
            } else {
                queryParams.where = "OBJECTID" + "=" + featureIDArray[0];
            }

            queryTask.execute(queryParams, lang.hitch(this, function (result) {
                result.layerIndex = featureIDArray[1];
                featureArray.push({
                    attr: result.features[0],
                    layerId: result.layerIndex,
                    fields: result.fields
                });
                this._fetchQueryResults(mapPoint, featureArray);
            }), function (err) {
                deferred.reject();
            });
        },

        /**
        * Description
        * @method _checkLayerVisibility
        * @param {} layerUrl
        * @return returnVal
        */
        _checkLayerVisibility: function (layerUrl) {
            var layer, lastChar, mapLayerUrl, layerUrlIndex = layerUrl.split('/'),
                returnVal = false;
            layerUrlIndex = layerUrlIndex[layerUrlIndex.length - 1];
            for (layer in this.map._layers) {
                if (this.map._layers.hasOwnProperty(layer)) {
                    if (this.map._layers[layer].url === layerUrl) {
                        if (this.map._layers[layer].visibleAtMapScale) {
                            returnVal = true;
                            break;
                        }
                    } else if (this.map._layers[layer].visibleLayers) {
                        lastChar = this.map._layers[layer].url[this.map._layers[layer].url.length - 1];
                        if (lastChar === "/") {
                            mapLayerUrl = this.map._layers[layer].url + layerUrlIndex;
                        } else {
                            mapLayerUrl = this.map._layers[layer].url + "/" + layerUrlIndex;
                        }
                        if (mapLayerUrl === layerUrl) {
                            if (this.map._layers[layer].visibleLayers.indexOf(parseInt(layerUrlIndex, 10)) !== -1) {
                                if (this.map._layers[layer].visibleAtMapScale) {
                                    if (this.map._layers[layer].dynamicLayerInfos) {
                                        if (this.map.__LOD.scale < this.map._layers[layer].dynamicLayerInfos[parseInt(layerUrlIndex, 10)].minScale) {
                                            returnVal = true;
                                            break;
                                        }
                                    } else {
                                        returnVal = true;
                                        break;
                                    }
                                } else {
                                    returnVal = false;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            return returnVal;
        },

        _extentFromPoint: function (point) {
            var tolerance, screenPoint, pnt1, pnt2, mapPoint1, mapPoint2;
            tolerance = 9;
            screenPoint = this.map.toScreen(point);
            pnt1 = new esri.geometry.Point(screenPoint.x - tolerance, screenPoint.y + tolerance);
            pnt2 = new esri.geometry.Point(screenPoint.x + tolerance, screenPoint.y - tolerance);
            mapPoint1 = this.map.toMap(pnt1);
            mapPoint2 = this.map.toMap(pnt2);
            return new esri.geometry.Extent(mapPoint1.x, mapPoint1.y, mapPoint2.x, mapPoint2.y, this.map.spatialReference);
        },

        _fetchQueryResults: function (mapPoint, featureArray) {
            var _this = this;

            if (featureArray.length > 0) {
                if (featureArray.length === 1) {
                    domClass.remove(query(".esriCTInfoWindowRightArrow")[0], "esriCTShowInfoRightArrow");
                    this._createInfoWindowContent(mapPoint, featureArray[0].attr.geometry, featureArray[0].attr.attributes, featureArray[0].fields, featureArray[0].layerId, null, null, false);
                } else {
                    this.count = 0;
                    domAttr.set(query(".esriCTdivInfoTotalFeatureCount")[0], "innerHTML", '/' + featureArray.length);
                    this._createInfoWindowContent(mapPoint, featureArray[0].attr.geometry, featureArray[0].attr.attributes, featureArray[0].fields, featureArray[0].layerId, featureArray, this.count, false);
                    topic.publish("hideProgressIndicator");
                    query(".esriCTInfoWindowRightArrow")[0].onclick = function () {
                        _this._nextInfoContent(mapPoint, featureArray);
                    };
                    query(".esriCTInfoWindowLeftArrow")[0].onclick = function () {
                        _this._previousInfoContent(mapPoint, featureArray);
                    };
                }
            } else {
                topic.publish("hideProgressIndicator");
            }
        },

        _nextInfoContent: function (mapPoint, featureArray) {
            if (this.count < featureArray.length) {
                this.count++;
            }
            if (featureArray[this.count]) {
                this._createInfoWindowContent(mapPoint, featureArray[0].attr.geometry, featureArray[this.count].attr.attributes, featureArray[this.count].fields, featureArray[this.count].layerId, featureArray, this.count, false);
            }
        },

        _previousInfoContent: function (mapPoint, featureArray) {
            if (this.count !== 0 && this.count < featureArray.length) {
                this.count--;
            }
            if (featureArray[this.count]) {
                this._createInfoWindowContent(mapPoint, featureArray[0].attr.geometry, featureArray[this.count].attr.attributes, featureArray[this.count].fields, featureArray[this.count].layerId, featureArray, this.count, false);
            }
        },

        _getQueryString: function (key) {
            var extentValue = "", regex, qs;
            regex = new RegExp("[\\?&]" + key + "=([^&#]*)");
            qs = regex.exec(window.location.href);
            if (qs && qs.length > 0) {
                extentValue = qs[1];
            }
            return extentValue;
        },

        _generateLayerURL: function (operationalLayers) {
            var searchSettings, i, str, layerTitle, layerId, index;

            searchSettings = dojo.configData.SearchSettings;
            for (i = 0; i < operationalLayers.length; i++) {
                if (dojo.configData.WebMapId && lang.trim(dojo.configData.WebMapId).length !== 0) {
                    str = operationalLayers[i].url.split('/');
                    layerTitle = str[str.length - 3];
                    layerId = str[str.length - 1];
                    for (index = 0; index < searchSettings.length; index++) {
                        if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                            if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                searchSettings[index].QueryURL = str.join("/");
                            }
                        }
                    }
                } else {
                    if (operationalLayers[i].ServiceURL) {
                        str = operationalLayers[i].ServiceURL.split('/');
                        layerTitle = str[str.length - 3];
                        layerId = str[str.length - 1];
                        for (index = 0; index < searchSettings.length; index++) {
                            if (searchSettings[index].Title && searchSettings[index].QueryLayerId) {
                                if (layerTitle === searchSettings[index].Title && layerId === searchSettings[index].QueryLayerId) {
                                    searchSettings[index].QueryURL = str.join("/");
                                }
                            }
                        }
                    }
                }
            }
        },

        /**
        * load esri 'Home Button' widget which sets map extent to default extent
        * @return {object} Home button widget
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addHomeButton: function () {
            var home = new HomeButton({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return home;
        },

        _showBaseMapGallery: function () {
            var basMapGallery = new BaseMapGallery({
                map: this.map
            }, domConstruct.create("div", {}, null));
            return basMapGallery;
        },

        /**
        * load and add operational layers depending on their LoadAsServiceType specified in configuration file
        * @param {int} index Layer order specified in configuration file
        * @param {object} layerInfo Layer settings specified in configuration file
        * @memberOf widgets/mapSettings/mapSettings
        */
        _addOperationalLayerToMap: function (index, layerInfo) {
            if (layerInfo.LoadAsServiceType.toLowerCase() === "feature") {
                this._createFeatureServiceLayer(index, layerInfo, layerInfo.ServiceURL);
            } else if (layerInfo.LoadAsServiceType.toLowerCase() === "dynamic") {
                this._addDynamicLayerService(layerInfo);
            }
        },

        _addDynamicLayerService: function (layerInfo) {
            var str, lastIndex, layerTitle;

            str = layerInfo.ServiceURL.split('/');
            lastIndex = str[str.length - 1];
            if (isNaN(lastIndex) || lastIndex === "") {
                if (lastIndex === "") {
                    layerTitle = str[str.length - 3];
                } else {
                    layerTitle = str[str.length - 2];
                }
            } else {
                layerTitle = str[str.length - 3];
            }
            this.stagedSearch = setTimeout(lang.hitch(this, function () {
                this._addServiceLayers(layerTitle, layerInfo.ServiceURL);
            }), 500);
        },

        _addServiceLayers: function (layerTitle, layerURL) {
            var dynamicLayer, imageParams, lastIndex, dynamicLayerId;

            imageParams = new ImageParameters();
            lastIndex = layerURL.lastIndexOf('/');
            dynamicLayerId = layerURL.substr(lastIndex + 1);
            if (isNaN(dynamicLayerId) || dynamicLayerId === "") {
                if (isNaN(dynamicLayerId)) {
                    dynamicLayer = layerURL + "/";
                } else if (dynamicLayerId === "") {
                    dynamicLayer = layerURL;
                }
                if (layerURL.indexOf("/FeatureServer") >= 0) {
                    this._addHostedServices(dynamicLayer, layerTitle);
                } else {
                    this._createDynamicServiceLayer(dynamicLayer, imageParams, layerTitle);
                }

            } else {
                imageParams.layerIds = [dynamicLayerId];
                dynamicLayer = layerURL.substring(0, lastIndex + 1);
                if (layerURL.indexOf("/FeatureServer") >= 0) {
                    this._addHostedServices(dynamicLayer, layerTitle);
                } else {
                    this._createDynamicServiceLayer(dynamicLayer, imageParams, layerTitle, dynamicLayerId);
                }
            }
        },

        _createFeatureServiceLayer: function (index, layerInfo, layerURL) {
            var featureLayer = new FeatureLayer(layerURL, {
                id: index,
                mode: FeatureLayer.MODE_ONDEMAND,
                outFields: ["*"]
            });
            this.map.addLayer(featureLayer);
            featureLayer.on("load", lang.hitch(this, function (evt) {
                this._createOperationLayer(evt.layer);
            }));

        },

        //Add hosted services to the map
        _addHostedServices: function (layerURL, layerId) {
            var self = this, p, lyr;
            esri.request({
                url: layerURL + "?f=json",
                load: function (data) {
                    for (p = 0; p < data.layers.length; p++) {
                        lyr = layerURL + data.layers[p].id;
                        self._createFeatureServiceLayer(layerId + p, lyr, lyr);
                    }
                },
                error: function (err) {
                    alert(err.message);
                }
            });
        },

        _createDynamicServiceLayer: function (dynamicLayer, imageParams, layerTitle, layerId) {
            layerId = layerId || "";
            var dynamicMapService = new ArcGISDynamicMapServiceLayer(dynamicLayer, {
                imageParameters: imageParams,
                id: layerId !== "" ? layerTitle + '_' + layerId : layerTitle,
                visible: true
            });
            this.map.addLayer(dynamicMapService);
            dynamicMapService.on("load", lang.hitch(this, function (evt) {
                var idArray = evt.layer.id.split('_');
                if (idArray && idArray.length > 0 && !isNaN(parseInt(idArray[1], 10))) {
                    evt.layer.setVisibleLayers([parseInt(idArray[1], 10)]);
                }
                this._createOperationLayer(evt.layer);
            }));
        },

        _createOperationLayer: function (layer) {
            var urlArray, lastIndex, tempUrl, url, i, title, searchSettings, infoWindowSettings;
            this.operationLayersCount++;
            searchSettings = dojo.configData.SearchSettings;
            infoWindowSettings = dojo.configData.InfoWindowSettings;
            urlArray = layer.url.split('/');
            lastIndex = urlArray[urlArray.length - 1];
            //create a temp service url
            if (isNaN(lastIndex) || lastIndex === "") {
                if (lastIndex === "") {
                    tempUrl = layer.url;
                    title = urlArray[urlArray.length - 3];
                } else {
                    tempUrl = layer.url + "/";
                    title = urlArray[urlArray.length - 2];
                }
            } else {
                //layer is added as feature service
                tempUrl = layer.url;
                title = urlArray[urlArray.length - 3];
            }
            if (layer.visibleLayers) {
                //layer is addded as a dynamic
                for (i = 0; i < layer.visibleLayers.length; i++) {
                    url = tempUrl + parseInt(layer.visibleLayers[i], 10);
                    this._populateOperationLayerFields(layer, url, title, layer.visibleLayers[i]);
                }
            } else {
                //layer is added as feature service
                this._populateOperationLayerFields(layer, tempUrl, title, urlArray[urlArray.length - 1]);
            }
        },

        _populateOperationLayerFields: function (layer, url, title, id) {
            var j, operationLayer = {}, searchSettings, infoWindowSettings;
            searchSettings = dojo.configData.SearchSettings;
            infoWindowSettings = dojo.configData.InfoWindowSettings;

            //set the opertaion layer title
            operationLayer.layerTitle = title;
            //set the opertaion layer ID
            operationLayer.layerID = id;
            //set the opertaion layer service URL
            operationLayer.layerURL = url;
            //set infoWindowData for operation layer if available
            for (j = 0; j < infoWindowSettings.length; j++) {
                if (title === infoWindowSettings[j].Title && parseInt(id, 10) === parseInt((infoWindowSettings[j].QueryLayerId), 10)) {
                    operationLayer.infoWindowData = {
                        "infoWindowHeader": infoWindowSettings[j].InfoWindowHeaderField,
                        "infoWindowfields": infoWindowSettings[j].InfoWindowData
                    };
                    break;
                }
            }
            //set layer url in searchSetting if available
            for (j = 0; j < searchSettings.length; j++) {
                if (title === searchSettings[j].Title && parseInt(id, 10) === parseInt((searchSettings[j].QueryLayerId), 10)) {
                    searchSettings[j].QueryURL = operationLayer.layerURL;
                    break;
                }
            }
            dojo.operationLayerSettings.push(operationLayer);
            if (this.operationLayersCount === dojo.configData.OperationalLayers.length) {
                this._operationLayersLoaded = true;
                this._dependeciesLoadedEventHandler();
            }
        },

        _addLayerLegend: function () {
            var mapServerArray = [], i, legendObject;
            for (i in dojo.configData.OperationalLayers) {
                if (dojo.configData.OperationalLayers.hasOwnProperty(i)) {
                    if (dojo.configData.OperationalLayers[i].ServiceURL) {
                        mapServerArray.push(dojo.configData.OperationalLayers[i].ServiceURL);
                    }
                }
            }
            legendObject = this._addLegendBox();
            legendObject.startup(mapServerArray);
        },

        _addLegendBox: function () {
            this.legendObject = new Legends({
                map: this.map,
                isExtentBasedLegend: false
            }, domConstruct.create("div", {}, null));
            return this.legendObject;
        },

        _addLayerLegendWebmap: function (webMapLayers, webmapLayerList, hasLayers) {
            var mapServerArray = [], i, j, legendObject, layer;
            for (j = 0; j < webMapLayers.length; j++) {
                if (webMapLayers[j].layerObject) {
                    if (webMapLayers[j].layers) {
                        for (i = 0; i < webMapLayers[j].layers.length; i++) {
                            layer = webMapLayers[j].url + "/" + webMapLayers[j].layers[i].id;
                            if (webMapLayers[j].layers[i].layerDefinition && webMapLayers[j].layers[i].layerDefinition.drawingInfo) {
                                hasLayers = true;
                                //  webmapLayerList.push(layer);
                                webmapLayerList[layer] = webMapLayers[j].layers[i];
                            } else {
                                mapServerArray.push(layer);
                            }
                        }
                    } else if (webMapLayers[j].layerObject.layerInfos) {
                        for (i = 0; i < webMapLayers[j].layerObject.layerInfos.length; i++) {
                            layer = webMapLayers[j].url + "/" + webMapLayers[j].layerObject.layerInfos[i].id;
                            mapServerArray.push(layer);
                        }
                    } else {
                        mapServerArray.push(webMapLayers[j].url);
                    }
                } else {
                    mapServerArray.push(webMapLayers[j].url);
                }
            }
            if (!hasLayers) {
                webmapLayerList = null;
            }
            legendObject = this._addLegendBox();
            legendObject.startup(mapServerArray, webmapLayerList);
            topic.publish("setMaxLegendLength");
        },

        _createInfoWindowContent: function (anchorPoint, geometry, attributes, fields, infoIndex, featureArray, count, zoomToFeature) {
            try {
                var infoPopupFieldsCollection, infoPopupHeight, infoPopupWidth, fieldInfos,
                    divInfoDetailsTab, key, divInfoRow, i, fieldNames, link, divLink, j, infoTitle, mapPoint, utcMilliseconds, attribute, k, domain, l;
                this.map.infoWindow.hide();
                mapPoint = anchorPoint || this._getMapPoint(geometry);
                if (featureArray) {
                    if (featureArray.length > 1 && count !== featureArray.length - 1) {
                        domClass.add(query(".esriCTInfoWindowRightArrow")[0], "esriCTShowInfoRightArrow");
                        domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count);
                    } else {
                        domClass.remove(query(".esriCTInfoWindowRightArrow")[0], "esriCTShowInfoRightArrow");
                        domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", "");
                    }
                    if (count > 0 && count < featureArray.length) {
                        domClass.add(query(".esriCTInfoWindowLeftArrow")[0], "esriCTShowInfoLeftArrow");
                        domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count + 1);
                    } else {
                        domClass.remove(query(".esriCTInfoWindowLeftArrow")[0], "esriCTShowInfoLeftArrow");
                        domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", count + 1);
                    }
                } else {
                    domClass.remove(query(".esriCTInfoWindowRightArrow")[0], "esriCTShowInfoRightArrow");
                    domClass.remove(query(".esriCTInfoWindowLeftArrow")[0], "esriCTShowInfoLeftArrow");
                    domAttr.set(query(".esriCTdivInfoFeatureCount")[0], "innerHTML", "");
                    domAttr.set(query(".esriCTdivInfoTotalFeatureCount")[0], "innerHTML", "");
                }
                if (dojo.operationLayerSettings[infoIndex].infoWindowData) {
                    infoPopupFieldsCollection = dojo.operationLayerSettings[infoIndex].infoWindowData.infoWindowfields;
                    divInfoDetailsTab = domConstruct.create("div", {
                        "class": "esriCTInfoDetailsTab"
                    }, null);
                    this.divInfoDetailsContainer = domConstruct.create("div", {
                        "class": "esriCTInfoDetailsContainer"
                    }, divInfoDetailsTab);
                } else {
                    divInfoDetailsTab = domConstruct.create("div", {
                        "class": "esriCTInfoDetailsTab"
                    }, null);
                    this.divInfoDetailsContainer = domConstruct.create("div", {
                        "class": "esriCTInfoDetailsContainerError",
                        "innerHTML": sharedNls.errorMessages.emptyInfoWindowContent
                    }, divInfoDetailsTab);
                }
                infoPopupHeight = dojo.configData.InfoPopupHeight;
                infoPopupWidth = dojo.configData.InfoPopupWidth;
                if (infoPopupFieldsCollection) {
                    fieldInfos = this._getLayerFieldsInfo(dojo.operationLayerSettings[infoIndex].layerURL);
                    if (fieldInfos.isLayerAvailable) {
                        for (attribute in attributes) {
                            if (attributes.hasOwnProperty(attribute)) {
                                if (!attributes[attribute]) {
                                    attributes[attribute] = sharedNls.showNullValue;
                                } else {
                                    if (fieldInfos.fields) {
                                        for (i = 0; i < fieldInfos.fields.length; i++) {
                                            if (fieldInfos.fields[i].name === attribute) {
                                                if (fieldInfos.fields[i].domain) {
                                                    if (fieldInfos.fields[i].domain.codedValues) {
                                                        for (j = 0; j < fieldInfos.fields[i].domain.codedValues.length; j++) {
                                                            if (attributes[attribute] === fieldInfos.fields[i].domain.codedValues[j].code) {
                                                                attributes[attribute] = fieldInfos.fields[i].domain.codedValues[j].name;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        for (j = 0; j < fields.length; j++) {
                            if (fields[j].type === "esriFieldTypeDate") {
                                if (attributes[fields[j].name]) {
                                    if (Number(attributes[fields[j].name])) {
                                        utcMilliseconds = Number(attributes[fields[j].name]);
                                        attributes[fields[j].name] = dojo.date.locale.format(this.utcTimestampFromMs(utcMilliseconds), {
                                            datePattern: dojo.configData.DatePattern,
                                            selector: "date"
                                        });
                                    }
                                }
                            }
                        }

                        if (fieldInfos.typeIdField && attributes[fieldInfos.typeIdField]) {
                            for (k = 0; k < fieldInfos.types.length; k++) {
                                if (attributes[fieldInfos.typeIdField] === fieldInfos.types[k].id) {
                                    attributes[fieldInfos.typeIdField] = fieldInfos.types[k].name;
                                    if (fieldInfos.types[k].domains) {
                                        for (domain in fieldInfos.types[k].domains) {
                                            if (fieldInfos.types[k].domains.hasOwnProperty(domain)) {
                                                if (attributes[domain]) {
                                                    if (fieldInfos.types[k].domains[domain].codedValues) {
                                                        for (l = 0; l < fieldInfos.types[k].domains[domain].codedValues.length; l++) {
                                                            if (attributes[domain] === fieldInfos.types[k].domains[domain].codedValues[l].code) {
                                                                attributes[domain] = fieldInfos.types[k].domains[domain].codedValues[l].name;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    break;
                                }
                            }
                        }

                        for (key = 0; key < infoPopupFieldsCollection.length; key++) {
                            divInfoRow = domConstruct.create("div", {
                                "className": "esriCTDisplayRow"
                            }, this.divInfoDetailsContainer);
                            // Create the row's label
                            this.divInfoDisplayField = domConstruct.create("div", {
                                "className": "esriCTDisplayField",
                                "innerHTML": infoPopupFieldsCollection[key].DisplayText
                            }, divInfoRow);
                            this.divInfoFieldValue = domConstruct.create("div", {
                                "className": "esriCTValueField"
                            }, divInfoRow);
                            fieldNames = string.substitute(infoPopupFieldsCollection[key].FieldName, attributes);
                            if (string.substitute(infoPopupFieldsCollection[key].FieldName, attributes).match("http:") || string.substitute(infoPopupFieldsCollection[key].FieldName, attributes).match("https:")) {
                                link = fieldNames;
                                divLink = domConstruct.create("div", {
                                    "class": "esriCTLink",
                                    "link": link,
                                    "innerHTML": sharedNls.buttons.link
                                }, this.divInfoFieldValue);
                                on(divLink, "click", this._openDetailWindow);
                            } else {
                                this.divInfoFieldValue.innerHTML = fieldNames;
                            }
                        }


                    }

                }
                if (dojo.operationLayerSettings[infoIndex].infoWindowData && dojo.operationLayerSettings[infoIndex].infoWindowData.infoWindowHeader) {
                    infoTitle = string.substitute(dojo.operationLayerSettings[infoIndex].infoWindowData.infoWindowHeader, attributes);
                } else {
                    infoTitle = sharedNls.errorMessages.emptyInfoWindowTitle;
                }
                dojo.selectedMapPoint = mapPoint;
                this._setInfoWindowZoomLevel(mapPoint, infoTitle, divInfoDetailsTab, infoPopupWidth, infoPopupHeight, count, zoomToFeature);
                topic.publish("hideProgressIndicator");
            } catch (err) {
                alert(err.message);
            }
        },

        _getLayerFieldsInfo: function (queryURL) {
            var layerId, lastIndex, layerIndex, layerURLwithSlash, layerURL, layerFieldsInfo = {};
            layerFieldsInfo.isLayerAvailable = false;
            layerFieldsInfo.types = null;
            layerFieldsInfo.typeIdField = null;
            layerFieldsInfo.fields = null;
            lastIndex = queryURL.lastIndexOf('/');
            layerIndex = queryURL.substr(lastIndex + 1);
            layerURLwithSlash = queryURL.substring(0, lastIndex + 1);
            layerURL = queryURL.substring(0, lastIndex);
            for (layerId in this.map._layers) {
                if (this.map._layers.hasOwnProperty(layerId)) {
                    if (this.map._layers[layerId].url) {
                        if (queryURL === this.map._layers[layerId].url) {
                            layerFieldsInfo.isLayerAvailable = true;
                            layerFieldsInfo.fields = this.map._layers[layerId].fields || null;
                            layerFieldsInfo.typeIdField = this.map._layers[layerId].typeIdField || null;
                            layerFieldsInfo.types = this.map._layers[layerId].types || null;
                            break;
                        } else if ((layerURL === this.map._layers[layerId].url || layerURLwithSlash === this.map._layers[layerId].url) && array.indexOf(this.map._layers[layerId].visibleLayers, parseInt(layerIndex, 10)) > -1) {
                            layerFieldsInfo.isLayerAvailable = true;
                            layerFieldsInfo.fields = this.map._layers[layerId].layerInfos;
                            break;
                        }
                    }
                }
            }
            return layerFieldsInfo;
        },

        _validateAvailableLayers: function (queryURL, layer) {
            var lastIndex, layerIndex, layerURLwithSlash, layerURL, isLayerAvailable = false;
            lastIndex = queryURL.lastIndexOf('/');
            layerIndex = queryURL.substr(lastIndex + 1);
            layerURLwithSlash = queryURL.substring(0, lastIndex + 1);
            layerURL = queryURL.substring(0, lastIndex);
            if (layer.url) {
                if (queryURL === layer.url) {
                    isLayerAvailable = true;
                } else if ((layerURL === layer.url || layerURLwithSlash === layer.url) && array.indexOf(layer.visibleLayers, parseInt(layerIndex, 10)) > -1) {
                    isLayerAvailable = true;
                }
            }
            return isLayerAvailable;
        },

        _openDetailWindow: function () {
            var link = domAttr.get(this, "link");
            window.open(link);
        },

        utcTimestampFromMs: function (utcMilliseconds) { // returns Date
            return this.localToUtc(new Date(utcMilliseconds));
        },

        localToUtc: function (localTimestamp) { // returns Date
            return new Date(localTimestamp.getTime() + (localTimestamp.getTimezoneOffset() * 60000));
        },

        _setInfoWindowZoomLevel: function (mapPoint, infoTitle, divInfoDetailsTab, infoPopupWidth, infoPopupHeight, count, zoomToFeature) {
            var extentChanged, screenPoint, zoomDeferred;
            if (this.map.getLevel() !== dojo.configData.ZoomLevel && zoomToFeature) {
                zoomDeferred = this.map.setLevel(dojo.configData.ZoomLevel);
                this.map.infoWindow.hide();
                zoomDeferred.then(lang.hitch(this, function () {
                    extentChanged = this.map.setExtent(this._calculateCustomMapExtent(mapPoint));
                    extentChanged.then(lang.hitch(this, function () {
                        topic.publish("hideProgressIndicator");
                        screenPoint = this.map.toScreen(dojo.selectedMapPoint);
                        screenPoint.y = this.map.height - screenPoint.y;
                        this._onSetInfoWindowPosition(infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight, count);
                    }));
                }));
            } else {
                extentChanged = this.map.setExtent(this._calculateCustomMapExtent(mapPoint));
                this.map.infoWindow.hide();
                extentChanged.then(lang.hitch(this, function () {
                    topic.publish("hideProgressIndicator");
                    screenPoint = this.map.toScreen(dojo.selectedMapPoint);
                    screenPoint.y = this.map.height - screenPoint.y;
                    this._onSetInfoWindowPosition(infoTitle, divInfoDetailsTab, screenPoint, infoPopupWidth, infoPopupHeight, count);
                }));
            }
        },

        _calculateCustomMapExtent: function (mapPoint) {
            var width, height, ratioHeight, totalYPoint, infoWindowHeight, xmin, ymin, xmax, ymax;

            width = this.map.extent.getWidth();
            height = this.map.extent.getHeight();
            ratioHeight = height / this.map.height;
            totalYPoint = dojo.configData.InfoPopupHeight + 30 + 61;
            infoWindowHeight = height - (ratioHeight * totalYPoint);
            xmin = mapPoint.x - (width / 2);
            ymin = mapPoint.y - infoWindowHeight;
            xmax = xmin + width;
            ymax = ymin + height;
            return new esri.geometry.Extent(xmin, ymin, xmax, ymax, this.map.spatialReference);
        },

        //Fetch the geometry type of the mapPoint
        _getMapPoint: function (geometry) {
            var selectedMapPoint, mapPoint, rings, points;
            if (geometry.type === "point") {
                selectedMapPoint = geometry;
            } else if (geometry.type === "polyline") {
                selectedMapPoint = geometry.getPoint(0, 0);
            } else if (geometry.type === "polygon") {
                mapPoint = geometry.getExtent().getCenter();
                if (!geometry.contains(mapPoint)) {
                    //if the center of the polygon does not lie within the polygon
                    rings = Math.floor(geometry.rings.length / 2);
                    points = Math.floor(geometry.rings[rings].length / 2);
                    selectedMapPoint = geometry.getPoint(rings, points);
                } else {
                    //if the center of the polygon lies within the polygon
                    selectedMapPoint = geometry.getExtent().getCenter();
                }
            }
            return selectedMapPoint;
        },
        /**
        * return current map instance
        * @return {object} Current map instance
        * @memberOf widgets/mapSettings/mapSettings
        */
        getMapInstance: function () {
            return this.map;
        }
    });
});
