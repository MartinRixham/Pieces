define([
	"qunit",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavPiece",
	"js/pieces/NavButton",
	"js/pieces/Route"
], function(
	QUnit,
	ScrollNavPiece,
	NavPiece,
	NavButton,
	Route) {

	QUnit.module("Scroll Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		Route.reset();
	});

	QUnit.test("Nav with two pages", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new ScrollNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(container);

		assert.strictEqual(nav.pages[0].page, pageOne);
		assert.strictEqual(nav.pages[1].page, pageTwo);

		assert.strictEqual(nav.getCurrentIndex(), -1);
		assert.strictEqual(location.hash, "");
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new ScrollNavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		nav.onBind(container);

		nav.hidden().init();

		assert.ok(!button.classes.active());

		button.click();

		var event = document.createEvent("Event");
		event.initEvent("scroll", true, true);
		dispatchEvent(event);
		dispatchEvent(event);

		assert.strictEqual(nav.pages[0].page, page);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Nav with sub-navigation", function(assert) {

		var done = assert.async();

		var firstPage = {};
		var secondPage = {};

		var pageOne = {};

		var pageTwo =
			new NavPiece([
				{ route: "one", page: firstPage },
				{ route: "two", page: secondPage }
			]);

		var nav =
			new ScrollNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(document.createElement("DIV"));

		nav.pages[1].update().events.__PIECES_BIND__(new Event("__PIECES_BIND__"));

		pageTwo.onBind(document.createElement("DIV"));

		location.hash = "route/two";

		setTimeout(function() {

			assert.strictEqual(nav.getCurrentIndex(), 1);
			assert.strictEqual(pageTwo.currentPage, secondPage);

			done();
		}, 1050);
	});

	QUnit.test("Navigate from route with sub-navigation", function(assert) {

		var done = assert.async();

		location.hash = "route/two";
		Route.reset();

		var firstPage = {};
		var secondPage = {};

		var pageOne = {};

		var pageTwo =
			new NavPiece([
				{ route: "one", page: firstPage },
				{ route: "two", page: secondPage }
			]);

		var nav =
			new ScrollNavPiece([
				{ route: "path", page: pageOne },
				{ route: "route", page: pageTwo }
			]);

		nav.onBind(document.createElement("DIV"));

		nav.pages[1].update().events.__PIECES_BIND__(new Event("__PIECES_BIND__"));

		pageTwo.onBind(document.createElement("DIV"));

		setTimeout(function() {

			assert.strictEqual(nav.getCurrentIndex(), 1);
			assert.strictEqual(pageTwo.currentPage, secondPage);

			done();
		}, 1050);
	});
});
