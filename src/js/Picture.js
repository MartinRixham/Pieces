define(["jquery"], function($) {

	// Load a smaller picture on smaller screens.
	var width = new Datum(innerWidth);

	var url = "https://images.unsplash.com/";

	var params = "?auto=format&fit=crop&q=80&w=";

	function Picture(id) {

		this.onBind = function(element) {

			$(element).load("html/picture.html");
		};

		// The update callback is called when the width changes.
		this.image = new Update(function(element) {

			element.src = url + id + params + Math.min(720, width());
		});
	}

	addEventListener("resize", function() {

		width(innerWidth);
	});

	return Picture;
});
