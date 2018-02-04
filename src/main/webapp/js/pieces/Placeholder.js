define([], function() {

	function Placeholder(page) {

		this.onBind = function(element) {

			for (var i = element.children.length - 1; i >= 0; i--) {

				element.removeChild(element.children[i]);
			}

			for (var j = 0; j < page.length; j++) {

				element.appendChild(page[j]);
			}
		};
	}

	return Placeholder;
});
