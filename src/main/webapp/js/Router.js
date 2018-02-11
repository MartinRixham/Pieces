define(["jquery", "js/Code"], function($, Code) {

	function Router() {

		var animal = new Datum("");

		this.onBind = function(element) {

			$(element).load("html/router.html");
		};

		this.animal = new Value(animal);

		this.image =
			new Update(function(element) {

				element.src = "images/animals/" + animal() + ".jpg";
			});

		this.code = new Code("Router.js");
	}

	return Router;
});
