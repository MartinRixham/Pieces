define([
	"jquery",
	"js/Code",
	"js/pieces/RouterPiece"
], function(
	$,
	Code,
	RouterPiece) {

	function Router() {

		// Animal name property.
		var animal = new Datum("");

		// The router piece looks for a property named route.
		this.route = animal;

		// Datum calls this method when the object is bound to an element.
		this.onBind = function(element) {

			// Load the template.
			$(element).load("html/router.html");
		};

		// Property that binds to the animal input.
		this.animal = new Datum.Value(animal);

		// The update callback is called whenever the animal is updated.
		this.image =
			new Datum.Update(function(element) {

				// Display the image.
				element.src = "images/animals/" + animal() + ".jpg";
			});

		this.code = new Code("Router.js");

		// Wrap the object in the router piece.
		return new RouterPiece(this);
	}

	return Router;
});
