define([
	"qunit",
	"js/pieces/RouterPiece"
], function(
	QUnit,
	RouterPiece) {

	QUnit.module("Router Piece");

	QUnit.testStart(function() {

		location.hash = "";
	});

	QUnit.test("Show router page", function(assert) {

		var page = {

			setRoute: function() {}
		};
		var nav = new RouterPiece(page);

		assert.strictEqual(nav.page, page);
	});

	QUnit.test("Set route on hash change", function(assert) {

		var done = assert.async();

		var page = {

			route: "",
			setRoute: function(route) {

				this.route = route;
			}
		};

		new RouterPiece(page);

		location.hash = "giraffe";

		setTimeout(function() {

			assert.strictEqual(page.route, "giraffe");

			done();
		});
	});

	QUnit.test("Set route on bind", function(assert) {

		location.hash = "goat";

		var page = {

			route: "",
			setRoute: function(route) {

				this.route = route;
			}
		};

		var router = new RouterPiece(page);

		router.onBind(document.createElement("DIV"));

		assert.strictEqual(page.route, "goat");
	});
});
