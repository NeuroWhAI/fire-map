window.$ = window.jQuery = require('jquery');
import dialogPolyfill from 'dialog-polyfill'
import 'ol/ol.css';
import { Map, View, Feature } from 'ol';
import Overlay from 'ol/Overlay';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import Geolocation from 'ol/Geolocation';
import { Style, Circle as CircleStyle, Fill, Stroke, Icon } from 'ol/style';
import { defaults as defaultInteraction } from 'ol/interaction';
import Point from 'ol/geom/Point';


if (!Promise.prototype.finally) {
    Promise.prototype.finally = function(onfinally) {
        return this.then(onfinally, onfinally);
    }
}


$(document).ready(function() {
    const HOST = "";


    function tryParseJson(text) {
        try {
            return JSON.parse(text);
        }
        catch {
            return null;
        }
    }

    function formatTime(time) {
        let month = time.getMonth() + 1;
        if (month < 10) month = '0' + month;
        let day = time.getDate();
        if (day < 10) day = '0' + day;
        let hours = time.getHours();
        if (hours < 10) hours = '0' + hours;
        let mins = time.getMinutes();
        if (mins < 10) mins = '0' + mins;
        return `${month}. ${day}. ${hours}:${mins}`;
    }

    var domText = document.createTextNode('');
    var domNative = document.createElement('span');
    domNative.appendChild(domText);
    function escapeHtml(html) {
        domText.nodeValue = html;
        return domNative.innerHTML;
    }

    function showSnackbar(message, timeout = null, actionText = null, handler = null) {
        let snackbarContainer = document.querySelector('#snackbar');
        if (snackbarContainer && snackbarContainer.MaterialSnackbar) {
            var data = {
                message: message,
                timeout: timeout,
                actionHandler: handler,
                actionText: actionText
            };
            snackbarContainer.MaterialSnackbar.showSnackbar(data);
        }
        else {
            setTimeout(() => {
                showSnackbar(message, timeout, actionText, handler);
            }, 1000);
        }
    }

    var dlgLoading = document.getElementById("dlgLoading");
    if (!dlgLoading.showModal) {
        dialogPolyfill.registerDialog(dlgLoading);
    }
    function showLoadingDialog() {
        dlgLoading.showModal();
    }
    function closeLoadingDialog() {
        dlgLoading.close();
    }

    var dlgDelete = document.getElementById("dlgDelete");
    if (!dlgDelete.showModal) {
        dialogPolyfill.registerDialog(dlgDelete);
    }
    function showDeleteDialog() {
        dlgDelete.showModal();
    }
    function closeDeleteDialog() {
        dlgDelete.close();
    }

    var dlgBadReport = document.getElementById("dlgBadReport");
    if (!dlgBadReport.showModal) {
        dialogPolyfill.registerDialog(dlgBadReport);
    }
    function showBadReportDialog() {
        refreshBadCaptcha();

        dlgBadReport.showModal();
    }
    function closeBadReportDialog() {
        dlgBadReport.close();

        // Reset form.
        $("#txtBadReason").val("");
    }

    function getGpsPosition() {
        let geom = positionFeature.getGeometry();
        if (geom) {
            return geom.getCoordinates();
        }
        else {
            return null;
        }
    }

    function moveViewToGpsPosition() {
        if (!geolocation.getTracking()) {
            geolocation.setTracking(true);
        }

        let here = getGpsPosition();
        if (here) {
            map.getView().animate({
                center: here,
                zoom: 16,
                duration: 300,
            });
        }
    }

    var imgCaptcha = $("#imgCaptcha");
    function refreshReportCaptcha() {
        imgCaptcha.attr('src', `${HOST}/captcha?channel=1&${Date.now()}`);
        txtCaptcha.val("");
    }

    var imgBadCaptcha = $("#imgBadCaptcha");
    var txtBadCaptcha = $("#txtBadCaptcha");
    function refreshBadCaptcha() {
        imgBadCaptcha.attr('src', `${HOST}/captcha?channel=2&${Date.now()}`);
        txtBadCaptcha.val("");
    }

    function refreshReportMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.reports) {
                    showSnackbar("제보 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                reportSource.clear();

                let reports = data.reports;
                let lvlColors = ['#00b200', '#ffcd2e', '#fe871b', '#f41800', '#840300'];
                let time = new Date().getTime();

                for (let i = 0; i < reports.length; ++i) {
                    let report = reports[i];
                    if (report.lvl < 0 || report.lvl >= lvlColors.length) {
                        continue;
                    }
                    
                    // Calculate opacity.
                    let minOpacity = 50;
                    let opacity = 1 - (time - report.created_time * 1000) / (24 * 60 * 60 * 1000);
                    opacity = Math.round(opacity * (255 - minOpacity) + minOpacity);
                    opacity = Math.max(Math.min(opacity, 255), minOpacity);
                    opacity = opacity.toString(16);
                    if (opacity.length == 1) {
                        opacity = '0' + opacity;
                    }

                    let reportFeature = new Feature();
                    reportFeature.setId(report.id);
                    reportFeature.set('report', report);
                    reportFeature.setStyle(new Style({
                        image: new CircleStyle({
                            radius: (4 + report.lvl) * 2,
                            fill: new Fill({
                                color: lvlColors[report.lvl] + opacity,
                            })
                        }),
                        zIndex: report.lvl,
                    }));
                    reportFeature.setGeometry(new Point([report.longitude, report.latitude]));

                    reportSource.addFeature(reportFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("제보 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/report-map", true);
            req.send();
        });
    }

    function refreshShelterMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.shelters) {
                    showSnackbar("대피소 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                shelterSource.clear();

                let shelters = data.shelters;

                for (let i = 0; i < shelters.length; ++i) {
                    let shelter = shelters[i];
                    let shelterFeature = new Feature();
                    shelterFeature.set('shelter', shelter);
                    shelterFeature.setGeometry(new Point(fromLonLat([shelter.longitude, shelter.latitude])));
                    shelterFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 46],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'pixels',
                            src: 'shelter.png',
                        }),
                    }));

                    shelterSource.addFeature(shelterFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("대피소 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/shelter-map", true);
            req.send();
        });
    }

    function refreshCctvMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.cctvs) {
                    showSnackbar("CCTV 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                cctvSource.clear();

                let cctvs = data.cctvs;

                for (let i = 0; i < cctvs.length; ++i) {
                    let tv = cctvs[i];
                    let tvFeature = new Feature();
                    tvFeature.set('cctv', tv);
                    tvFeature.setGeometry(new Point(fromLonLat([tv.longitude, tv.latitude])));
                    tvFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 46],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'pixels',
                            src: 'cctv.png',
                        }),
                    }));

                    cctvSource.addFeature(tvFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("CCTV 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/cctv-map", true);
            req.send();
        });
    }

    function refreshEventMap() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.events) {
                    showSnackbar("산불 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                eventSource.clear();

                let events = data.events;

                for (let i = 0; i < events.length; ++i) {
                    let evt = events[i];
                    let evtFeature = new Feature();
                    evtFeature.set('event', evt);
                    evtFeature.setGeometry(new Point(fromLonLat([evt.longitude, evt.latitude])));
                    evtFeature.setStyle(new Style({
                        image: new Icon({
                            anchor: [0.5, 0.5],
                            anchorXUnits: 'fraction',
                            anchorYUnits: 'fraction',
                            src: statusToIcon(evt.status),
                        }),
                    }));

                    eventSource.addFeature(evtFeature);
                }

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("산불 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/fire-event-map", true);
            req.send();
        });
    }

    function levelToIcon(lvl) {
        const icons = ['mood', 'sentiment_dissatisfied', 'warning', 'whatshot', 'directions_run'];

        if (lvl >= 0 && lvl < icons.length) {
            return icons[lvl];
        }
        else {
            return 'bug_report';
        }
    }

    function levelToDescription(lvl) {
        const desc = [
            "안전 : 화재나 우려되는 현상이 없음.",
            "주의 : 화염, 화광이나 연기가 멀리 있음.",
            "경계 : 화염, 연기의 구체적인 형태 확인이 가능.",
            "심각 : 열기가 느껴지거나 불티가 날림.",
            "대피 : 대피령, 개인 판단으로 떠나야 하는 위치."
        ];

        if (lvl >= 0 && lvl < desc.length) {
            return desc[lvl];
        }
        else {
            return '';
        }
    }

    function statusToText(status) {
        const statusText = ["진화중", "진화완료", "산불외종료"];

        if (status >= 0 && status < statusText.length) {
            return statusText[status];
        }
        else {
            return '';
        }
    }
    
    function statusToIcon(status) {
        const icons = ["fire.png", "nofire.png", "clear.png"];

        if (status >= 0 && status < icons.length) {
            return icons[status];
        }
        else {
            return '';
        }
    }


    // Set fire warning image.
    $("#imgFireWarning").attr('src', HOST + "/fire-warning");


    const map = new Map({
        target: 'map-container',
        layers: [
            new TileLayer({
                source: new OSM()
            })
        ],
        view: new View({
            center: fromLonLat([127.931774, 36.453383]),
            zoom: 7,
        }),
        interactions: defaultInteraction({
            altShiftDragRotate: false,
            pinchRotate: false,
        }),
    });


    var geolocation = new Geolocation({
        trackingOptions: {
            enableHighAccuracy: true
        },
        projection: map.getView().getProjection()
    });

    // Circle geometry to show GPS accuracy.
    var accuracyFeature = new Feature();
    var firstLowAcc = true;
    geolocation.on('change:accuracyGeometry', function () {
        let acc = geolocation.getAccuracy();
        if (acc < 20000) {
            accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
            accuracyFeature.style = null;
        }
        else {
            accuracyFeature.style = { visibility: 'hidden' };

            if (firstLowAcc) {
                firstLowAcc = false;
                let errKm = Math.round(acc / 1000);
                showSnackbar(`현재 위치와 ${errKm}km 이상 차이가 날 수 있습니다.`, 3000);
            }
        }
    });

    // Point geometry to show GPS position.
    var positionFeature = new Feature();
    positionFeature.setStyle(new Style({
        image: new CircleStyle({
            radius: 6,
            fill: new Fill({
                color: '#3399CC'
            }),
            stroke: new Stroke({
                color: '#fff',
                width: 2
            })
        })
    }));

    // Track GPS position.
    var firstPosition = true;
    geolocation.on('change:position', function () {
        var coordinates = geolocation.getPosition();
        if (coordinates) {
            positionFeature.setGeometry(new Point(coordinates));

            if (firstPosition) {
                firstPosition = false;
                moveViewToGpsPosition();
            }
        }
    });

    // GPS layer.
    new VectorLayer({
        map: map,
        source: new VectorSource({
            features: [accuracyFeature, positionFeature]
        }),
    });


    var reportSource = new VectorSource();
    var reportLayer = new VectorLayer({
        source: reportSource,
        zIndex: 2,
    });
    map.addLayer(reportLayer);


    var shelterSource = new VectorSource();
    var shelterLayer = new VectorLayer({
        source: shelterSource,
        zIndex: 4,
    });
    map.addLayer(shelterLayer);


    var cctvSource = new VectorSource();
    var cctvLayer = new VectorLayer({
        source: cctvSource,
        zIndex: 3,
    });
    map.addLayer(cctvLayer);


    var eventSource = new VectorSource();
    var eventLayer = new VectorLayer({
        source: eventSource,
        zIndex: 5,
    });
    map.addLayer(eventLayer);


    var showShelter = true;
    var showCctv = true;
    var showWind = true;

    function updateVisibilityByZoom() {
        let needUpdate = false;
        let zoom = map.getView().getZoom();

        let visible = (showShelter && zoom > 13);
        if (shelterLayer.getVisible() != visible) {
            shelterLayer.setVisible(visible);
            needUpdate = true;
        }

        visible = (showCctv && zoom > 11);
        if (cctvLayer.getVisible() != visible) {
            cctvLayer.setVisible(visible);
            needUpdate = true;
        }

        if (needUpdate) {
            map.updateSize();
        }
    }

    function updateWindScale() {
        let data = wind.windData;

        if (!data) {
            return;
        }

        let resolution = map.getView().getResolution();
        let scale = data.resolution / resolution;

        let position = map.getPixelFromCoordinate([data.offset_x, data.offset_y]);
        if (!position) {
            return;
        }
        position[1] -= data.height * scale;

        let offset = [
            Math.max(-position[0] / scale, 0),
            Math.max(-position[1] / scale, 0)
        ];

        wind.move(position[0], position[1]);
        wind.offset(offset[0], offset[1]);
        wind.zoom(scale);
        wind.reset();

        if (showWind) {
            windCanvas.hidden = false;
        }
    }

    map.on('movestart', function() {
        windCanvas.hidden = true;
    });
    map.on('moveend', function() {
        updateWindScale();
        updateVisibilityByZoom();
    });


    let mapContainer = $("#map-container");
    let windCanvas = document.getElementById("windCanvas");
    windCanvas.width = mapContainer.width();
    windCanvas.height = mapContainer.height();
    
    const gl = windCanvas.getContext('webgl', {antialiasing: false});

    const wind = window.wind = new WindGL(gl);
    wind.numParticles = calcNumParticles();

    function calcNumParticles() {
        return Math.min(Math.floor(mapContainer.width() / 8 * mapContainer.height() / 8),
            10000);
    }

    function drawWind() {
        if (wind.windData && !windCanvas.hidden) {
            wind.draw();
        }
        requestAnimationFrame(drawWind);
    }
    drawWind();

    function updateWindCanvasSize() {
        windCanvas.width = mapContainer.width();
        windCanvas.height = mapContainer.height();
        wind.resize();

        wind.numParticles = calcNumParticles();
    }

    function refreshWind() {
        return new Promise(function(resolve, reject) {
            var req = new XMLHttpRequest();
            req.onload = function() {
                let data = tryParseJson(req.response);

                if (!data || !data.width) {
                    showSnackbar("바람 데이터를 가져올 수 없습니다.");
                    reject();
                    return;
                }

                let windData = data;
                const windImage = new Image();
                windData.image = windImage;
                windImage.src = HOST + "/wind-map?id=" + data.id;
                windImage.onload = function () {
                    wind.setWind(windData);
                    updateWindScale();
                };

                resolve();
            }
            req.onerror = function() {
                reject();
                showSnackbar("바람 데이터를 가져올 수 없습니다.");
            }

            req.open("GET", HOST + "/wind-map-metadata", true);
            req.send();
        });
    }


    // Get and Show data to map.
    showLoadingDialog();
    refreshReportMap()
        .then(() => refreshShelterMap())
        .then(() => refreshCctvMap())
        .then(() => refreshEventMap())
        .then(() => refreshWind())
        .finally(closeLoadingDialog);


    $("#btnTrackLocation").on('click', moveViewToGpsPosition);
    $("#btnRefresh").on('click', function() {
        closeAllPopups();

        showLoadingDialog();
        refreshReportMap()
            .then(() => refreshEventMap())
            .then(() => refreshWind())
            .finally(closeLoadingDialog);
    });


    var barLevel = $("#barLevel");
    var txtLevel = $("#txtLevel");
    var icoReportForm = $("#icoForm");

    function onChangeLevel() {
        txtLevel.text(levelToDescription(barLevel.val()));
        icoReportForm.text(levelToIcon(barLevel.val()));
    }
    onChangeLevel();

    barLevel.on('input', onChangeLevel);
    barLevel.on('change', onChangeLevel);


    var txtDesc = $("#txtDesc"),
        txtCaptcha = $("#txtCaptcha"),
        txtUserId = $("#txtUserId"),
        txtUserPwd = $("#txtUserPwd");


    var overlay = $("#overlay"),
        fab = $(".fab"),
        cancel = $("#cancel"),
        btnSubmit = $("#btnSubmit");
    
    // fab click
    fab.on('click', openFAB);
    overlay.on('click', closeFAB);
    cancel.on('click', closeFAB);
    btnSubmit.on('click', submitReport);

    function openFAB(event) {
        if (event) event.preventDefault();
        fab.addClass('active');
        overlay.addClass('dark-overlay');
        
        // Move view to GPS position.
        moveViewToGpsPosition();

        // Init form.
        icoReportForm.text(levelToIcon(barLevel.val()));
        refreshReportCaptcha();

        fab.off('click');
    }
    
    function closeFAB(event) {
        if (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    
        fab.removeClass('active');
        overlay.removeClass('dark-overlay');

        fab.on('click', openFAB);
    }
    
    function submitReport(event) {
        // 데이터 검증
        let captchaText = txtCaptcha.val();
        let userId = txtUserId.val();
        let userPwd = txtUserPwd.val();

        if (captchaText.length == 0) {
            showSnackbar("자동입력 방지문자를 입력하세요.");
            return;
        }
        else if (userId.length < txtUserId.attr('minlength')) {
            showSnackbar("이름이 너무 짧습니다.");
            return;
        }
        else if (userId.length > txtUserId.attr('maxlength')) {
            showSnackbar("이름이 너무 깁니다.");
            return;
        }
        else if (userPwd.length < txtUserPwd.attr('minlength')) {
            showSnackbar("비밀번호가 너무 짧습니다.");
            return;
        }
        

        // Fill GPS data.
        let coords = getGpsPosition();
        if (!coords) {
            showSnackbar("GPS 위치를 찾을 수 없습니다.");
            return;
        }

        $("#txtLongitude").val(coords[0]);
        $("#txtLatitude").val(coords[1]);


        showLoadingDialog();

        // 제보 전송
        $.ajax({
            type: 'POST',
            url: HOST + "/report",
            data: $("#frmReport").serialize(),
            success: function(data, status, req) {
                closeLoadingDialog();

                if (status == 'success') {
                    closeFAB(event);
                    showSnackbar("제보되었습니다.");
                }
                else {
                    refreshReportCaptcha();
                    showSnackbar(data);
                }
            },
            error: function(xhr, options, err) {
                closeLoadingDialog();
                refreshReportCaptcha();

                if (xhr.responseText) {
                    showSnackbar("오류: " + xhr.responseText);
                }
                else {
                    showSnackbar("오류: " + err);
                }
            },
        });
    }


    var btnUpload = $("#btnUpload");
    var txtFile = $("#txtFile");

    btnUpload.on('change', (e) => {
        let files = e.target.files;

        if (!files || files.length == 0 || !files[0]) {
            return;
        }

        showLoadingDialog();

        var reader = new FileReader();
        reader.onload = function() {
            var req = new XMLHttpRequest();
            req.onload = function() {
                closeLoadingDialog();
                if (req.status == 200) {
                    txtFile.val(req.responseText);
                }
                else {
                    showSnackbar("업로드 실패.");
                }
            }
            req.onerror = function() {
                closeLoadingDialog();
                showSnackbar("업로드 실패.");
            }

            req.open("POST", HOST + "/upload-image", true);
            req.send(reader.result);
        }
        reader.onerror = function() {
            closeLoadingDialog();
            showSnackbar("파일을 읽을 수 없습니다.");
        }

        reader.readAsDataURL(files[0]);
    });


    $("#btnRefreshReportCaptcha").on('click', () => {
        refreshReportCaptcha();
    });


    var popupReport = document.getElementById("popupReport");
    var popupReportCloser = document.getElementById("popupReportCloser");
    var popupSelect = document.getElementById("popupSelect");
    var popupSelectCloser = document.getElementById("popupSelectCloser");
    var popupShelter = document.getElementById("popupShelter");
    var popupShelterCloser = document.getElementById("popupShelterCloser");
    var popupCctv = document.getElementById("popupCctv");
    var popupCctvCloser = document.getElementById("popupCctvCloser");
    var popupEvent = document.getElementById("popupEvent");
    var popupEventCloser = document.getElementById("popupEventCloser");
    var reportList = $("#reportList");

    var reportOverlay = new Overlay({
        element: popupReport,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var selectOverlay = new Overlay({
        element: popupSelect,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var shelterOverlay = new Overlay({
        element: popupShelter,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var cctvOverlay = new Overlay({
        element: popupCctv,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });
    var eventOverlay = new Overlay({
        element: popupEvent,
        autoPan: true,
        autoPanAnimation: {
            duration: 250
        }
    });

    function closeAllPopups() {
        closePopupReport();
        closePopupSelect();
        closePopupShelter();
        closePopupCctv();
        closePopupEvent();
    }

    function closePopupReport() {
        reportOverlay.setPosition(undefined);
        popupReportCloser.blur();

        restoreWindVisibility();
    }

    function closePopupSelect() {
        selectOverlay.setPosition(undefined);
        popupSelectCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupShelter() {
        shelterOverlay.setPosition(undefined);
        popupShelterCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupCctv() {
        cctvOverlay.setPosition(undefined);
        popupCctvCloser.blur();
        
        restoreWindVisibility();
    }

    function closePopupEvent() {
        eventOverlay.setPosition(undefined);
        popupEventCloser.blur();
        
        restoreWindVisibility();
    }

    popupReportCloser.onclick = function () {
        closePopupReport();
        return false;
    };
    popupSelectCloser.onclick = function () {
        closePopupSelect();
        return false;
    };
    popupShelterCloser.onclick = function () {
        closePopupShelter();
        return false;
    };
    popupCctvCloser.onclick = function () {
        closePopupCctv();
        return false;
    };
    popupEventCloser.onclick = function () {
        closePopupEvent();
        return false;
    };

    map.addOverlay(reportOverlay);
    map.addOverlay(selectOverlay);
    map.addOverlay(shelterOverlay);
    map.addOverlay(cctvOverlay);
    map.addOverlay(eventOverlay);

    function showReportPopup(id, coords) {
        closeAllPopups();
        windCanvas.hidden = true;
        
        $("#txtReportIdDelete").val(id);
        $("#txtBadReportId").val(id);

        showLoadingDialog();

        var req = new XMLHttpRequest();
        req.onload = function() {
            let report = tryParseJson(req.response);

            if (!report) {
                closeLoadingDialog();
                showSnackbar("제보를 가져올 수 없습니다.");
                return;
            }

            $("#icoReport").text(levelToIcon(report.lvl));
            $("#txtReportTime").text(formatTime(new Date(report.created_time * 1000)));
            $("#txtReportName").text(report.user_id);

            if (report.img_path.length > 0) {
                $("#imgReport").show()
                    .attr('src', HOST + "/" + report.img_path);
            }
            else {
                $("#imgReport").hide();
            }

            if (report.description.length > 0) {
                $("#txtReportDesc").show()
                    .text(report.description);
            }
            else {
                $("#txtReportDesc").hide();
            }

            closeLoadingDialog();

            reportOverlay.setPosition(coords);
        }
        req.onerror = function() {
            closeLoadingDialog();
            showSnackbar("제보를 가져올 수 없습니다.");
        }

        req.open("GET", HOST + "/report?id=" + id, true);
        req.send();
    }

    function showSelectPopup(reports, coords) {
        closeAllPopups();
        windCanvas.hidden = true;

        let now = new Date().getTime();

        const itemMapper = (r) => {
            let time = formatTime(new Date(r.created_time * 1000));

            return `
            <li class="mdl-list__item mdl-list__item--two-line">
                <span class="mdl-list__item-primary-content">
                    <i class="material-icons mdl-list__item-avatar">${levelToIcon(r.lvl)}</i>
                    <span>${escapeHtml(r.user_id)}</span>
                    <span class="mdl-list__item-sub-title">${escapeHtml(time)}</span>
                </span>
                <span class="mdl-list__item-secondary-content">
                    <button report-id="${r.id}" class="mdl-button mdl-js-button mdl-button--icon mdl-button--colored">
                        <i class="material-icons">input</i>
                    </button>
                </span>
            </li>
            `;
        };

        reportList.html(reports.map(itemMapper).join(''));
        
        reportList.off('click', 'button');
        reportList.on('click', 'button', function(e) {
            showReportPopup(parseInt($(this).attr('report-id')), coords);
        });

        selectOverlay.setPosition(coords);
    }

    function showShelterPopup(shelter, coords) {
        closeAllPopups();
        windCanvas.hidden = true;

        $("#txtShelterName").text(shelter.name);
        $("#txtShelterInfo").text(`수용: ${shelter.capacity}명, 면적: ${shelter.area}㎡`);

        shelterOverlay.setPosition(coords);
    }

    function showCctvPopup(cctv, coords) {
        closeAllPopups();
        windCanvas.hidden = true;

        showLoadingDialog();

        var req = new XMLHttpRequest();
        req.onload = function() {
            let tv = tryParseJson(req.response);

            if (!tv) {
                closeLoadingDialog();
                showSnackbar("CCTV 정보를 가져올 수 없습니다.");
                return;
            }

            let title = tv.name;
            let info = "CCTV";

            let match = /^\[(.+?)\]\s*/g.exec(title);
            if (match !== null) {
                title = tv.name.slice(match[0].length);
                info = match[1];
            }

            $("#txtCctvName").text(title);
            $("#txtCctvInfo").text(info);
            $("#movCctv").attr('src', tv.url);

            closeLoadingDialog();

            cctvOverlay.setPosition(coords);
        }
        req.onerror = function() {
            closeLoadingDialog();
            showSnackbar("CCTV 정보를 가져올 수 없습니다.");
        }

        req.open("GET", HOST + "/cctv?name=" + encodeURIComponent(cctv.name), true);
        req.send();
    }

    function showEventPopup(event, coords) {
        closeAllPopups();
        windCanvas.hidden = true;

        let rawDate = event.date;
        let date = `${rawDate.substr(0, 4)}-${rawDate.substr(4, 2)}-${rawDate.substr(6, 2)}`;

        let rawTime = event.time;
        let time = `${rawTime.substr(0, 2)}:${rawTime.substr(2, 2)}:${rawTime.substr(4, 2)}`;

        $("#imgEventStatus").attr('src', HOST + "/" + statusToIcon(event.status));
        $("#txtEventStatus").text(statusToText(event.status));
        $("#txtEventTime").text(`${date} ${time}`);
        $("#txtEventAddress").text(event.address);

        eventOverlay.setPosition(coords);
    }

    map.on('singleclick', function (evt) {
        let coords = evt.coordinate;

        let reports = [];
        let shelter = null;
        let cctv = null;
        let fireEvt = null;
        map.forEachFeatureAtPixel(evt.pixel, function (feat, layer) {
            if (layer === reportLayer) {
                reports.push(feat);
            }
            else if (layer === shelterLayer) {
                shelter = feat;
            }
            else if (layer === cctvLayer) {
                cctv = feat;
            }
            else if (layer === eventLayer) {
                fireEvt = feat;
            }
        });
        
        if (shelter !== null) {
            showShelterPopup(shelter.get('shelter'), shelter.getGeometry().getCoordinates());
        }
        else if (cctv !== null) {
            showCctvPopup(cctv.get('cctv'), cctv.getGeometry().getCoordinates());
        }
        else if (fireEvt !== null) {
            showEventPopup(fireEvt.get('event'), fireEvt.getGeometry().getCoordinates());
        }
        else if (reports.length >= 2) {
            showSelectPopup(reports.slice(0, 8).map((feat) => feat.get('report')), coords);
        }
        else if (reports.length == 1) {
            showReportPopup(reports[0].getId(), reports[0].getGeometry().getCoordinates())
        }
        else {
            // Close popups when clicking outside.
            closeAllPopups();
        }
    });


    $("#btnDeleteReport").on('click', showDeleteDialog);
    $("#btnCloseDeleteDlg").on('click', closeDeleteDialog);
    $("#btnSubmitDeleteDlg").on('click', () => {
        showLoadingDialog();

        let payload = $("#frmDelete").serialize();

        var req = new XMLHttpRequest();
        req.onload = function() {
            closeLoadingDialog();
            if (req.status == 200) {
                closeDeleteDialog();
                closePopupReport();
                showSnackbar("삭제되었습니다.");
            }
            else if (req.responseText) {
                showSnackbar("오류: " + req.responseText);
            }
            else {
                showSnackbar("삭제 실패.");
            }
        }
        req.onerror = function() {
            closeLoadingDialog();
            if (req.responseText) {
                showSnackbar("오류: " + req.responseText);
            }
            else {
                showSnackbar("삭제 실패.");
            }
        }

        req.open("DELETE", HOST + "/report?" + payload, true);
        req.send();
    });

    $("#btnRefreshBadCaptcha").on('click', () => {
        refreshBadCaptcha();
    });
    $("#btnBadReport").on('click', showBadReportDialog);
    $("#btnCloseBadDlg").on('click', closeBadReportDialog);
    $("#btnSubmitBadDlg").on('click', () => {
        showLoadingDialog();

        $.ajax({
            type: 'POST',
            url: HOST + "/bad-report",
            data: $("#frmBadReport").serialize(),
            success: function(data, status, req) {
                closeLoadingDialog();

                if (status == 'success') {
                    closeBadReportDialog(event);
                    showSnackbar("신고되었습니다.");
                }
                else {
                    refreshBadCaptcha();
                    showSnackbar(data);
                }
            },
            error: function(xhr, options, err) {
                closeLoadingDialog();
                refreshBadCaptcha();

                if (xhr.responseText) {
                    showSnackbar("오류: " + xhr.responseText);
                }
                else {
                    showSnackbar("오류: " + err);
                }
            },
        });
    });


    // Menu
    $("#menuToggleShelter").on('click', () => {
        showShelter = !showShelter;
        updateVisibilityByZoom();

        if (!showShelter) {
            closePopupShelter();
        }
    })
    $("#menuToggleCctv").on('click', () => {
        showCctv = !showCctv;
        updateVisibilityByZoom();

        if (!showCctv) {
            closePopupCctv();
        }
    })
    $("#menuToggleWind").on('click', () => {
        windCanvas.hidden = showWind;
        showWind = !showWind;
    });

    function restoreWindVisibility() {
        windCanvas.hidden = !showWind;
    }

    
    // Adjust map again.
    map.updateSize();


    function whenUpdateSize() {
        updateWindCanvasSize()

        let width = $(document).width();
    
        if (width < 360) {
            $("#txtAppTitle").text("Maps");
        }
        else {
            $("#txtAppTitle").text("Fire Maps");
        }
    }
    whenUpdateSize();
    
    $(window).resize(whenUpdateSize);
});
