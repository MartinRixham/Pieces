define([
	"qunit",
	"js/pieces/SlideNavPiece",
	"js/pieces/NavButton",
	"js/pieces/Route"
], function(
	QUnit,
	SlideNavPiece,
	NavButton,
	Route) {

	QUnit.module("Slide Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		Route.reset();
	});

	QUnit.test("Horizontal nav with one page", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new SlideNavPiece([{ route: "route", page: page }]);

		nav.onBind(container);

		assert.strictEqual(nav.datumPiecesFirstPage, page);
		assert.strictEqual(nav.datumPiecesSecondPage, null);
		assert.strictEqual(container.lastChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new SlideNavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		nav.onBind(container);

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.datumPiecesFirstPage, page);
		assert.strictEqual(nav.datumPiecesSecondPage, null);
		assert.strictEqual(container.lastChild.style.left, "0px");
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Click on second button", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(1, nav)();

		nav.onBind(container);

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.datumPiecesSecondPage, pageTwo);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show second page", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		nav.showPage(1);

		assert.strictEqual(nav.datumPiecesSecondPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show unknown page", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		var button = new NavButton(0, nav)();

		button.click();

		assert.strictEqual(nav.datumPiecesFirstPage, pageOne);
		assert.strictEqual(nav.datumPiecesSecondPage, null);
		assert.strictEqual(container.lastChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Route page from hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		location.hash = "go";
		Route.reset();

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		assert.strictEqual(nav.datumPiecesFirstPage, pageTwo);
		assert.strictEqual(nav.datumPiecesSecondPage, null);
		assert.strictEqual(container.lastChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), 1);
	});

	QUnit.test("Route page from unknown hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		location.hash = "gone";
		Route.reset();

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		assert.strictEqual(nav.datumPiecesFirstPage, pageOne);
		assert.strictEqual(nav.datumPiecesSecondPage, null);
		assert.strictEqual(container.lastChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Remove old elements", function(assert) {

		var pageOne = {};

		var container = document.createElement("DIV");
		var child = document.createElement("DIV");

		container.appendChild(child);

		var nav = new SlideNavPiece([{ route: "clear", page: pageOne }]);

		nav.onBind(container);

		assert.strictEqual(container.children.length, 1);
	});

	QUnit.test("Detect hash change", function(assert) {

		var done = assert.async();

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		location.hash = "go";

		setTimeout(function() {

			assert.strictEqual(nav.datumPiecesFirstPage, pageTwo);
			assert.strictEqual(nav.datumPiecesSecondPage, null);
			assert.strictEqual(container.lastChild.style.left, "0px");
			assert.strictEqual(nav.getCurrentIndex(), 1);

			done();
		}, 100);
	});

	QUnit.test("Lazy load page", function(assert) {

		pageOneLoaded = false;
		pageTwoLoaded = false;

		var pageOneAction = function() {
			pageOneLoaded = true;

			return {};
		};

		var pageTwo = {};

		var pageTwoAction = function() {
			pageTwoLoaded = true;

			return pageTwo;
		};

		var nav =
			new SlideNavPiece(
				[
					{ route: "come", page: pageOneAction },
					{ route: "go", page: pageTwoAction }
				]);

		var button = new NavButton(1, nav)();

		nav.onBind(document.createElement("DIV"));

		assert.ok(pageOneLoaded);
		assert.ok(!pageTwoLoaded);

		button.click();

		assert.strictEqual(nav.datumPiecesSecondPage, pageTwo);
		assert.ok(pageOneLoaded);
		assert.ok(pageTwoLoaded);
	});
});
