require([
	"qunit",
	"js/pieces/NavPiece",
	"js/pieces/NavButton"
], function(
	QUnit,
	NavPiece,
	NavButton) {

	QUnit.start();

	QUnit.testStart(function() {

		location.hash = "";
	});

	QUnit.test("Nav with one page", function(assert) {

		var page = {};
		var nav = new NavPiece([{ route: "route", page: page }]);

		assert.strictEqual(nav.currentPage, page);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var nav = new NavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.currentPage, page);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Click on second button", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new NavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(1, nav)();

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.currentPage, pageTwo);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show second page", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new NavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.showPage(1);

		assert.strictEqual(nav.currentPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");
	});

	QUnit.test("Show unknown page", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		var nav =
			new NavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(0, nav)();

		button.click();

		nav.showPage(-1);

		assert.strictEqual(nav.currentPage, pageOne);
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Route page from hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		location.hash = "go";

		var nav =
			new NavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		assert.strictEqual(nav.currentPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Route page from unknown hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};

		location.hash = "gone";

		var nav =
			new NavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		assert.strictEqual(nav.currentPage, pageOne);
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});
});

