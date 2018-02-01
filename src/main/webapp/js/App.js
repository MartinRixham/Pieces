define(["jquery"], function($) {

	function App() {

		this.menu =
			new Init(function(element) {

				$(element).sticky({

					context: "#content"
				});
			});
	}

	return App;
});
