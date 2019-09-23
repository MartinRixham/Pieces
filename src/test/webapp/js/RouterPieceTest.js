define([
	"Datum",
	"qunit",
	"js/pieces/RouterPiece",
	"js/pieces/NavPiece",
	"js/pieces/Route"
], function(
	Datum,
	QUnit,
	RouterPiece,
	NavPiece,
	Route) {

	QUnit.module("Router Piece");

	QUnit.testStart(function() {

		location.hash = "";
		new Route().reset();
	});

	QUnit.test("Show router page", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		assert.strictEqual(router.page, page);
	});

	QUnit.test("Set route on hash change", function(assert) {

		var done = assert.async();

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route(), "giraffe");

			done();
		});
	});

	QUnit.test("Route page from hash", function(assert) {

		location.hash = "goat";
		new Route().reset();

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));
		router.route().update();

		assert.strictEqual(page.route(), "goat");
	});

	QUnit.test("Detect hash change", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));
		router.route().update();

		page.route("tiger");

		router.route().update();

		assert.strictEqual(location.hash, "#tiger");
	});

	QUnit.test("Route is string property", function(assert) {

		var done = assert.async();

		location.hash = "goat";
		new Route().reset();

		var page = { route: "" };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));
		router.route().update();

		assert.strictEqual(page.route, "goat");

		page.route = "tiger";

		router.route().update();

		assert.strictEqual(location.hash, "#tiger");

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route, "giraffe");

			done();
		});
	});

	QUnit.test("Nested routers", function(assert) {

		location.hash = "start/end";
		new Route().reset();

		var parent = { route: new Datum() };
		var parentRouter = new RouterPiece(parent);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.onBind(document.createElement("DIV"));
		childRouter.onBind(document.createElement("DIV"));

		assert.strictEqual(parent.route(), "start");
		assert.strictEqual(child.route(), "end");
	});

	QUnit.test("URL encode", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));
		router.route().update();

		page.route("tiger/");

		router.route().update();

		assert.strictEqual(location.hash, "#tiger%2F");
	});

	QUnit.test("URL decode", function(assert) {

		location.hash = "goat%2F";
		new Route().reset();

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));
		router.route().update();

		assert.strictEqual(page.route(), "goat/");
	});

	QUnit.test("Set route after navigation", function(assert) {

		var done = assert.async();

		new Route().reset();

		var page = { route: new Datum("") };
		var router = new RouterPiece(page);

		var nav = new NavPiece([
			{ route: "route", page: router },
			{ route: "notherroute", page: {} }
		]);

		nav.onBind(document.createElement("DIV"));
		router.onBind(document.createElement("DIV"));
		router.route().update();

		assert.strictEqual(page.route(), "");
		assert.strictEqual(location.hash, "");

		page.route("thingy");
		router.route().update();

		assert.strictEqual(location.hash, "#/thingy");

		nav.showPage(1);

		assert.strictEqual(location.hash, "#notherroute");

		location.hash = "";
		page.route("sumpt");
		router.route().update();

		setTimeout(function() {
			assert.strictEqual(location.hash, "#/sumpt");

			done();
		});
	});
});
