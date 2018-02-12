define([
	"jquery",
	"js/Code",
	"js/pieces/RouterPiece"
], function(
	$,
	Code,
	RouterPiece) {

	function Router() {

		var animal = new Datum("");

		this.route = animal;

		this.onBind = function(element) {

			$(element).load("html/router.html");
		};

		this.animal = new Value(animal);

		this.image =
			new Update(function(element) {

				element.src = "images/animals/" + animal() + ".jpg";
			});

		this.code = new Code("Router.js");

		return new RouterPiece(this);
	}

	return Router;
});
