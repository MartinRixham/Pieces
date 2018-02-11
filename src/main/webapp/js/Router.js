define(["jquery"], function($) {

	function One() {

		var animal = new Datum("");

		this.onBind = function(element) {

			$(element).load("html/router.html");
		};

		this.animal = new Value(animal);

		this.image =
			new Update(function(element) {

				element.src = "images/animals/" + animal() + ".jpg";
			});
	}

	return One;
});
