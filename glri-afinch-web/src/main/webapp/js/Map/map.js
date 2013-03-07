Ext.ns("AFINCH");

AFINCH.MapPanel = Ext.extend(GeoExt.MapPanel, {
    border: false,
    map: undefined,
    wmsGetFeatureInfoControl: undefined,
    WGS84_GOOGLE_MERCATOR: new OpenLayers.Projection("EPSG:900913"),
    gagePointSymbolizer: new OpenLayers.Format.SLD().write({
        namedLayers: [{
                name: "glri:GageLoc",
                userStyles: [
                    new OpenLayers.Style("Gage Style",
                            {
                                rules: [
                                    new OpenLayers.Rule({
                                        symbolizer: {
                                            Point: new OpenLayers.Symbolizer.Point({
                                                graphicName: 'Circle',
                                                strokeColor: '#99FF99',
                                                fillColor: '#00FF00',
                                                pointRadius: 4,
                                                fillOpacity: 0.5,
                                                strokeOpacity: 0.5
                                            })
                                        }
                                    })
                                ]
                            })
                ]
            }]
    }),
    defaultMapConfig: {
        layers: {
            baseLayers: [],
            layers: []
        },
        initialZoom: undefined,
        initialExtent: new OpenLayers.Bounds(-15702073.155034, 2738495.0572218, -6309491.121034, 6612935.1462468)
    },
    constructor: function(config) {
        LOG.debug('map.js::constructor()');
        var config = config || {};

        var EPSG900913Options = {
            sphericalMercator: true,
            layers: "0",
            isBaseLayer: true,
            projection: this.WGS84_GOOGLE_MERCATOR,
            units: "m",
            maxResolution: 156543.0339,
            buffer: 3,
            transitionEffect: 'resize'
        };


        this.defaultMapConfig.layers.baseLayers = [
            new OpenLayers.Layer.XYZ(
                    "World Light Gray Base",
                    "http://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}",
                    Ext.apply(EPSG900913Options, {
                numZoomLevels: 14
            })
                    ),
            new OpenLayers.Layer.XYZ(
                    "World Terrain Base",
                    "http://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/${z}/${y}/${x}",
                    Ext.apply(EPSG900913Options, {
                numZoomLevels: 14
            })
                    ),
            new OpenLayers.Layer.XYZ(
                    "USA Topo Map",
                    "http://services.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/${z}/${y}/${x}",
                    Ext.apply(EPSG900913Options, {
                numZoomLevels: 16
            })
                    )
        ];

        this.defaultMapConfig.layers.overlays = [
            new OpenLayers.Layer.WMS(
                    'NHD Flowlines',
                    CONFIG.endpoint.geoserver + 'glri/wms',
                    {
                        layers: 'NHDFlowline',
                        transparent: true
                    },
            {
                isBaseLayer: false,
                unsupportedBrowsers: [],
                tileOptions: {
                    maxGetUrlLength: 2048
                }
            }),
            new OpenLayers.Layer.WMS(
                    'Gage Locations',
                    CONFIG.endpoint.geoserver + 'glri/wms',
                    {
                        layers: 'GageLoc',
                        transparent: true,
                        sld_body: this.gagePointSymbolizer,
                        tiled: true,
                        format: "image/png"
                    },
            {
                isBaseLayer: false,
                unsupportedBrowsers: [],
                tileOptions: {
                    maxGetUrlLength: 2048,
                    crossOriginKeyword: 'anonymous'
                }
            })
        ];

        this.map = new OpenLayers.Map({
            //order of controls defines z-index
            projection: this.WGS84_GOOGLE_MERCATOR,
            controls: [
                new OpenLayers.Control.Navigation(),
                new OpenLayers.Control.MousePosition({
                    prefix: 'POS: '
                }),
                new OpenLayers.Control.Attribution({template:
                            '<img id="attribution" src="' + CONFIG.mapLogoUrl + '"/>'}),
                new OpenLayers.Control.OverviewMap(),
                new OpenLayers.Control.ScaleLine({
                    geodesic: true
                }),
                new OpenLayers.Control.PanZoomBar({
                    zoomWorldIcon: true
                }),
                new OpenLayers.Control.LayerSwitcher()
            ]
        });


        config = Ext.apply({
            id: 'map-panel',
            region: 'center',
            map: this.map,
            extent: this.defaultMapConfig.initialExtent,
            prettyStateKeys: true,
            layers: new GeoExt.data.LayerStore({
                initDir: GeoExt.data.LayerStore.STORE_TO_MAP,
                map: this.map,
                layers: this.defaultMapConfig.layers.baseLayers.union(this.defaultMapConfig.layers.overlays),
                listeners: {
                    load: function(store) {
                        LOG.debug('map.js::constructor(): Base layer store loaded ' + store.getCount() + ' base layers.');
                    }
                }
            }),
            border: false
        }, config);

        AFINCH.MapPanel.superclass.constructor.call(this, config);
        LOG.info('map.js::constructor(): Construction complete.');

        this.wmsGetFeatureInfoControl = new OpenLayers.Control.WMSGetFeatureInfo({
            title: 'gage-identify-control',
            hover: false,
            autoActivate: true,
            layers: this.defaultMapConfig.layers.overlays,
            queryVisible: true,
            output: 'object',
            drillDown: true,
            infoFormat: 'application/vnd.ogc.gml',
            vendorParams: {
                radius: 3
            }
        });

        this.wmsGetFeatureInfoControl.events.register("getfeatureinfo", this, this.wmsGetFeatureInfoHandler);
        this.map.addControl(this.wmsGetFeatureInfoControl);
    },
    wmsGetFeatureInfoHandler: function(responseObject) {
        var features = responseObject.features[0].features;
        var layerFeatures = {
            'GageLoc': [],
            'NHDFlowline': []
        };
        var gageLocFeatureStore, nhdFlowLineFeatureStore;

        if (features.length) {
            features.each(function(feature) {
                layerFeatures[feature.gml.featureType].push(feature);
            });
        }

        gageLocFeatureStore = new GeoExt.data.FeatureStore({
            features: layerFeatures.GageLoc,
            fields : [
                {name : 'ComID', type:'int'},
                {name : 'TotDASqKM', type:'double'},
                {name : 'REACHCODE', type:'long'},
                {name : 'SOURCE_FEA', type:'long'}
            ],
            initDir : 0
        });

        nhdFlowLineFeatureStore = new GeoExt.data.FeatureStore({
            features: layerFeatures.NHDFlowline,
            fields : [
                {name : 'COMID', type:'long'},
                {name : 'GNIS_NAME', type:'string'}
            ],
            initDir: 0
        });

        if (gageLocFeatureStore.totalLength || nhdFlowLineFeatureStore.totalLength) {
            var gageGridPanel, nhdFlowLineGridPanel;

            var tabPanel = new Ext.TabPanel({
                region: 'center',
                height: 400,
                width: 800,
                activeTab: 0,
                autoScroll: true,
                layoutOnTabChange: true,
                activeScroll: false
            });

            if (gageLocFeatureStore.totalLength) {
                gageGridPanel = new gxp.grid.FeatureGrid({
                    title: 'Gage',
                    store: gageLocFeatureStore
                });
                tabPanel.add(gageGridPanel);
            }

            if (nhdFlowLineFeatureStore.totalLength) {
                nhdFlowLineGridPanel = new gxp.grid.FeatureGrid({
                    title: 'NHD Flowlines',
                    store: nhdFlowLineFeatureStore
                });
                tabPanel.add(nhdFlowLineGridPanel);
            }
            var popup = Ext.ComponentMgr.get('identify-popup');
            if (popup) {
                popup.destroy();
            }
            popup = new GeoExt.Popup({
                id: 'identify-popup',
                layout: 'fit',
                anchored: false,
                map: CONFIG.mapPanel.map,
                unpinnable: true,
                width: 'auto',
                height: 'auto',
                items: [tabPanel],
                listeners: {
                    show: function() {
                        // Remove the anchor element (setting anchored to 
                        // false does not do this for us. *Shaking fist @ GeoExt)
                        Ext.select('.gx-popup-anc').remove();
                    }
                }

            });
            popup.show();
        }

    }
});
