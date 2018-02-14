define([
	"qunit",
	"js/pieces/RouterPiece",
	"js/pieces/Route"
], function(
	QUnit,
	RouterPiece,
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

		router.route().init();

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route(), "giraffe");

			done();
		});
	});

	QUnit.test("Route page from hash", function(assert) {

		location.hash = "goat";

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.route().init();
		router.route().update();

		assert.strictEqual(page.route(), "goat");
	});

	QUnit.test("Detect hash change", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.route().init();
		router.route().update();

		page.route("tiger");

		router.route().update();

		assert.strictEqual(location.hash, "#tiger");
	});

	QUnit.test("Route is string property", function(assert) {

		var done = assert.async();

		location.hash = "goat";

		var page = { route: "" };
		var router = new RouterPiece(page);

		router.route().init();
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

		var parent = { route: new Datum() };
		var parentRouter = new RouterPiece(parent);

		var child = { route: new Datum() };
		var childRouter = new RouterPiece(child);

		parentRouter.route().init();
		childRouter.route().init();

		assert.strictEqual(parent.route(), "start");
		assert.strictEqual(child.route(), "end");
	});

	QUnit.test("URL encode", function(assert) {

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.route().init();
		router.route().update();

		page.route("tiger/");

		router.route().update();

		assert.strictEqual(location.hash, "#tiger%2F");
	});

	QUnit.test("URL decode", function(assert) {

		location.hash = "goat%2F";

		var page = { route: new Datum() };
		var router = new RouterPiece(page);

		router.route().init();
		router.route().update();

		assert.strictEqual(page.route(), "goat/");
	});
});
