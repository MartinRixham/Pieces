require([
	"qunit",
	"js/pieces/HorizontalNavPiece",
	"js/pieces/NavButton"
], function(
	QUnit,
	HorizontalNavPiece,
	NavButton) {

	QUnit.testStart(function() {

		location.hash = "";
	});

	QUnit.test("Horizontal nav with one page", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new HorizontalNavPiece([{ route: "route", page: page }]);

		nav.onBind(container);

		assert.strictEqual(nav.firstPage, page);
		assert.strictEqual(nav.secondPage, null);
		assert.strictEqual(container.firstChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Click on first button", function(assert) {

		var page = {};
		var container = document.createElement("DIV");
		var nav = new HorizontalNavPiece([{ route: "route", page: page }]);
		var button = new NavButton(0, nav)();

		nav.onBind(container);

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.firstPage, page);
		assert.strictEqual(nav.secondPage, null);
		assert.strictEqual(container.firstChild.style.left, "0px");
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Click on second button", function(assert) {

		var done = assert.async();

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new HorizontalNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		var button = new NavButton(1, nav)();

		nav.onBind(container);

		assert.ok(!button.classes.active());

		button.click();

		assert.strictEqual(nav.secondPage, pageTwo);
		assert.ok(button.classes.active());
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");

		setTimeout(function() {

			assert.strictEqual(container.firstChild.style.left, "-100%");
			assert.strictEqual(nav.firstPage, null);

			done();
		}, 1000)
	});

	QUnit.test("Show second page", function(assert) {

		var done = assert.async();

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new HorizontalNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		nav.showPage(1);

		assert.strictEqual(nav.secondPage, pageTwo);
		assert.strictEqual(nav.getCurrentIndex(), 1);
		assert.strictEqual(location.hash, "#go");

		setTimeout(function() {

			assert.strictEqual(container.firstChild.style.left, "-100%");
			assert.strictEqual(nav.firstPage, null);

			done();
		}, 1000)
	});

	QUnit.test("Show unknown page", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		var nav =
			new HorizontalNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		var button = new NavButton(0, nav)();

		button.click();

		nav.showPage(-1);

		assert.strictEqual(nav.firstPage, pageOne);
		assert.strictEqual(nav.secondPage, null);
		assert.strictEqual(container.firstChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), 0);
	});

	QUnit.test("Route page from hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		location.hash = "go";

		var nav =
			new HorizontalNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		assert.strictEqual(nav.firstPage, pageTwo);
		assert.strictEqual(nav.secondPage, null);
		assert.strictEqual(container.firstChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});

	QUnit.test("Route page from unknown hash", function(assert) {

		var pageOne = {};
		var pageTwo = {};
		var container = document.createElement("DIV");

		location.hash = "gone";

		var nav =
			new HorizontalNavPiece(
				[
					{ route: "come", page: pageOne },
					{ route: "go", page: pageTwo }
				]);

		nav.onBind(container);

		assert.strictEqual(nav.firstPage, pageOne);
		assert.strictEqual(nav.secondPage, null);
		assert.strictEqual(container.firstChild.style.left, "0px");
		assert.strictEqual(nav.getCurrentIndex(), -1);
	});
});

