define([
	"qunit",
	"js/pieces/FadeNavPiece",
	"js/pieces/NavButton",
	"js/pieces/Route"
], function(
	QUnit,
	FadeNavPiece,
	NavButton,
	Route) {

	QUnit.module("Fade Nav Piece");

	QUnit.testStart(function() {

		location.hash = "";
		Route.reset();
	});

	QUnit.test("Nav with one page", function(assert) {

		var page = {};
		var nav = new FadeNavPiece([{ route: "route", page: page }]);

		nav.onBind(document.createElement("DIV"));

		assert.strictEqual(nav.datumPiecesNewPage, page);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var nav = new FadeNavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		nav.onBind(document.createElement("DIV"));

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.datumPiecesNewPage, page);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Click on second button", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(1, nav)();

		nav.onBind(document.createElement("DIV"));

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.datumPiecesNewPage, pageTwo);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show second page", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(document.createElement("DIV"));

		nav.showPage(1);

		assert.strictEqual(nav.datumPiecesNewPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show unknown page", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(0, nav)();

		nav.onBind(document.createElement("DIV"));

		button.click();

		nav.showPage(-1);

		assert.strictEqual(nav.datumPiecesNewPage, pageOne);
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Route page from hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		location.hash = "go";
		Route.reset();

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(document.createElement("DIV"));

		assert.strictEqual(nav.datumPiecesNewPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), 1);
	});

	QUnit.test("Route page from unknown hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		location.hash = "gone";

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(document.createElement("DIV"));

		assert.strictEqual(nav.datumPiecesNewPage, pageOne);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Remove old elements", function(assert) {

		var pageOne = {};

		var container = document.createElement("DIV");
		var child = document.createElement("DIV");

		container.appendChild(child);

		var nav =
			new FadeNavPiece([{ route: "clear", page: pageOne }]);

		nav.onBind(container);

		assert.strictEqual(container.children.length, 2);
	});

	QUnit.test("Detect hash change", function(assert) {

		var done = assert.async();

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new FadeNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(document.createElement("DIV"));

		location.hash = "go";

		setTimeout(function() {

			assert.strictEqual(nav.datumPiecesNewPage, pageTwo);
			assert.strictEqual(nav.getCurrentIndex(), 1);

			done();
		}, 100);
	});
});
